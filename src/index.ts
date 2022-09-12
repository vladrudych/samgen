import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Callback, Context, Handler as AWSHandler } from "aws-lambda";
import 'reflect-metadata';
import { AWS } from './aws';
export { AWS } from './aws';

const PARAMS_METADATA_KEY = Symbol("params");
type ParamType = 'body' | 'query' | 'path';
type Constructable<T> = new (...args: any[]) => T;

interface ParamDefinition {
    index: number;
    type: ParamType;
    name: string;
}

interface CookieOptions {
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    maxAge?: number;
    expires?: Date;
    sameSite?: 'Strict' | 'Lax' | 'None';
}


export class ApiHandlerError {
    constructor(public readonly status: number, public error: any) { }
}

export class Request {

    constructor(
        public readonly proto: any,
        public readonly options: AWS.Function,
        public readonly context: Context,
        public readonly event: APIGatewayProxyEvent) { }

    public resolveParams() {

        const types: Constructable<any>[] = Reflect
            .getMetadata('design:paramtypes', this.proto, 'handle') || [];

        const definitions: ParamDefinition[] = Reflect
            .getOwnMetadata(PARAMS_METADATA_KEY, this.proto, 'handle') || [];

        const params: (number | string | boolean | object)[] = [];

        for (let i = 0; i < definitions.length; i++) {

            const type = types[i];
            const def = definitions.find(d => d.index === i);

            let value: any = undefined;

            if (def) {

                if (def.type === 'body') {
                    value = this.event.body;
                } else if (def.type === 'query') {
                    value = this.event.queryStringParameters ? this.event.queryStringParameters[def.name] : undefined;
                } else if (def.type === 'path') {
                    value = this.event.pathParameters ? this.event.pathParameters[def.name] : undefined;
                }

                if (value !== undefined) {
                    if (type?.name === Number.name) {
                        value = Number(value);
                    } else if (type?.name === String.name) {
                        value = String(value);
                    } else if (type?.name === Boolean.name) {
                        value = Boolean(value);
                    } else {
                        try {
                            value = JSON.parse(value);
                        } catch { }
                    }
                }

            } else {
                value = undefined;
            }

            params[i] = value;
        }

        return params;
    }

}

export class Response {

    constructor(public readonly awsResponse: APIGatewayProxyResult) { }

    public get headers() {
        return this.awsResponse.headers || (this.awsResponse.headers = {});
    }

    public get status() { return this.awsResponse.statusCode; }
    public set status(status: number) { this.awsResponse.statusCode = status; }

    public setCookie(name: string, value: string, options: CookieOptions | undefined = undefined) {

        if (!this.awsResponse.multiValueHeaders) this.awsResponse.multiValueHeaders = {};

        const cookies = (this.awsResponse.multiValueHeaders['set-cookie']
            || (this.awsResponse.multiValueHeaders['set-cookie'] = [])) as string[];

        const existingIndex = cookies.findIndex(c => c.startsWith(name + '='));

        let result = `${name}=${value}`;

        if (options) {
            if (options.path)
                result += `; Path=${options.path}`;
            if (options.domain)
                result += `; Domain=${options.domain}`;
            if (options.expires)
                result += `; Expires=${options.expires}`;
            if (options.maxAge)
                result += `; Max-Age=${options.maxAge}`;
            if (options.sameSite)
                result += `; SameSite=${options.sameSite}`;
            if (options.secure)
                result += `; Secure`;
            if (options.httpOnly)
                result += `; HttpOnly`;
        }

        if (existingIndex !== -1) {
            cookies[existingIndex] = result;
        } else {
            cookies.push(result);
        }

    }

}


function param(type: ParamType, name: string = '') {
    return function (target: Object, propertyKey: string | symbol, parameterIndex: number) {
        let params: ParamDefinition[] = Reflect.getOwnMetadata(PARAMS_METADATA_KEY, target, propertyKey) || [];
        params.push({ index: parameterIndex, type: type, name: name });
        Reflect.defineMetadata(PARAMS_METADATA_KEY, params, target, propertyKey);
    }
}

export function FromBody() {
    return param('body');
}

export function FromQuery(name: string) {
    return param('query', name);
}

export function FromPath(name: string) {
    return param('path', name);
}


export function LambdaFunction(options: AWS.Function) {
    return function (constructor: Constructable<ApiHandler<any> | Handler>) {
        constructor.prototype.options = options;
    };
}

export abstract class Handler {
    public readonly handler!: AWSHandler;
}

export abstract class ApiHandler<ApiHandlerResponse> extends Handler {

    public options!: AWS.Function;

    private req!: Request;
    private res!: Response;

    private awsRes!: APIGatewayProxyResult;

    private cb!: Callback<APIGatewayProxyResult>;

    public readonly handler!: APIGatewayProxyHandler;

    public get request() { return this.req; }
    public get response() { return this.res; }

    public abstract handle(...args: any[]): Promise<any>;

    constructor() {
        super();
        this.handler = (event, context, callback) => this.execute(event, context, callback);
    }

    public intercept() {
        return Promise.resolve();
    }

    private addCorsHeaders() {
        this.res.headers['Access-Control-Allow-Origin'] = '*';
        this.res.headers['Access-Control-Allow-Methods'] = 'GET, POST, HEAD, OPTIONS, PATCH, PUT, DELETE';
        this.res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    }

    private handleError(e: any) {

        console.error(e);

        this.addCorsHeaders();

        this.res.headers!['Content-Type'] = 'application/json';

        if (e instanceof ApiHandlerError) {
            this.awsRes.statusCode = e.status;
            this.awsRes.body = JSON.stringify(e.error);
        } else {
            this.awsRes.body = '{"message":"Internal server error!"}';
            this.awsRes.statusCode = 500;
        }

        console.log(this.awsRes);
        this.cb(null, this.awsRes);

    }

    private execute(event: APIGatewayProxyEvent, context: Context, callback: Callback<APIGatewayProxyResult>) {

        console.log(event);

        this.cb = callback;
        context.callbackWaitsForEmptyEventLoop = false;

        this.awsRes = {
            body: '',
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            multiValueHeaders: {},
            isBase64Encoded: false,
        };

        this.req = new Request((this as object).constructor.prototype, this.options, context, event);
        this.res = new Response(this.awsRes);

        console.log(this.request.resolveParams());

        this.intercept().then(() => {
            this.handle(...this.request.resolveParams()).then(r => {
                this.awsRes.body = JSON.stringify(r);
                console.log(this.awsRes);
                this.addCorsHeaders();
                callback(null, this.awsRes);
            }).catch(e => this.handleError(e));
        }).catch(e => this.handleError(e));
    }

}

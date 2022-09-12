const fs = require('fs');
const ts = require('typescript');
const path = require('path');
const YAML = require('yaml');

function extractLiteral(node) {
    switch (node.kind) {
        case ts.SyntaxKind.ObjectLiteralExpression:
            return node.properties.reduce((obj, n) => {
                obj[n.name.escapedText] = extractLiteral(n.initializer);
                return obj;
            }, {});
        case ts.SyntaxKind.ArrayLiteralExpression:
            return node.elements.map(e => extractLiteral(e));
        case ts.SyntaxKind.StringLiteral:
            return node.text;
        case ts.SyntaxKind.NumericLiteral:
            return Number(node.text);
        case ts.SyntaxKind.FalseKeyword:
            return false;
        case ts.SyntaxKind.TrueKeyword:
            return true;
        default:
            console.log(node);
            return undefined;
    }
}

function getName(name = '') {
    return name.replace(/([A-Z][a-z])/g, '-$1').replace(/(\d+)/g, '-$1').replace(/^-/, '').toLowerCase();
}

/**
 * @typedef FunctionDefinition
 * @property name {string}
 * @property path {string}
 * @property func {object}
 * @property handler {string}
 * @property imports {string[]}
 * @property returnType {string}
 * @property httpPath {string}
 * @property httpMethod {string}
 * @property parameters {{source:string;type:string;name:string}[]}
 */

/** 
 * @typedef TsFile
 * @property path {string}
 * @property source {ts.SourceFile}
 * @property classes {ts.ClassDeclaration[]}
 * @property interfaces {ts.InterfaceDeclaration[]}
 * @property types {ts.TypeAliasDeclaration[]}
 * @property enums {ts.EnumDeclaration[]}
 * @property imports {any[]}
 * */

/** @type {{[key:string]:TsFile}} */
const files = {};

function openFile(filePath) {

    let file = files[filePath];

    if (!file) {

        const content = fs.readFileSync(filePath, 'utf8');
        const source = ts.createSourceFile('x.ts', content, ts.ScriptTarget.Latest);

        files[filePath] = file = {
            path: filePath,
            source: source,
            // @ts-ignore
            classes: source.statements.filter(s => s.kind === ts.SyntaxKind.ClassDeclaration),
            // @ts-ignore
            interfaces: source.statements.filter(s => s.kind === ts.SyntaxKind.InterfaceDeclaration),
            // @ts-ignore
            enums: source.statements.filter(s => s.kind === ts.SyntaxKind.EnumDeclaration),
            // @ts-ignore
            types: source.statements.filter(s => s.kind === ts.SyntaxKind.TypeAliasDeclaration),
            imports: source.statements
                .filter(s => s.kind === ts.SyntaxKind.ImportDeclaration && s.importClause?.namedBindings)
                .map(s => ({
                    // @ts-ignore
                    path: s.moduleSpecifier.text,
                    // @ts-ignore
                    type: s.importClause?.namedBindings.kind === ts.SyntaxKind.NamespaceImport ? 'namespace' : 'import',
                    // @ts-ignore
                    namespace: s.importClause?.namedBindings?.name?.escapedText,
                    // @ts-ignore
                    members: s.importClause?.namedBindings?.elements?.map(e => e.name.escapedText),
                }))
        };
    }

    return file;

}

/**
 * @param {TsFile} file 
 * @param {string} name 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns 
 */
function renderInterface(file, name, typesDefinitions) {

    const interfaceDeclaration = file.interfaces.find(d => d.name.escapedText === name);

    if (interfaceDeclaration) {

        let imports = '';
        let definition = '';

        const className = interfaceDeclaration.name.escapedText;

        const importFound = (n = '') => {
            imports += `import { ${n} } from './${getName(n)}';\n`;
        }

        const classArguments = interfaceDeclaration.typeParameters?.length ?
            '<' + interfaceDeclaration.typeParameters.map(t => getType(t, file, typesDefinitions, importFound)).join(', ') + '>' : '';

        const classParents = interfaceDeclaration.heritageClauses?.length ?
            ' extends ' + interfaceDeclaration.heritageClauses[0].types.map(t => getType(t, file, typesDefinitions, importFound)).join(', ') : '';

        definition += `\nexport interface ${className}${classArguments}${classParents} {\n`;

        for (let m of interfaceDeclaration.members) {

            if (m.kind === ts.SyntaxKind.PropertySignature) {
                // @ts-ignore
                definition += `    ${m.name.escapedText}: ${getType(m.type, file, typesDefinitions, n => importFound(n))};\n`;
            }

            if (m.kind === ts.SyntaxKind.IndexSignature) {
                // @ts-ignore
                definition.def += `    { [${m.parameters[0].name.escapedText}: ${getType(m.parameters[0].type, file, typesDefinitions, importFound)}]: ${getType(m.type, file, typesDefinitions, importFound)} };\n`;
            }
        }

        definition += `}\n`;

        typesDefinitions[name] = imports + definition;

    }

    return !!interfaceDeclaration;
}

/**
 * @param {TsFile} file 
 * @param {string} name 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns 
 */
function renderEnum(file, name, typesDefinitions) {

    const enumDeclaration = file.enums.find(d => d.name.escapedText === name);

    if (enumDeclaration) {

        let definition = '';
        const className = enumDeclaration.name.escapedText;

        definition += `\nexport enum ${className} {\n`;

        enumDeclaration.members?.forEach(m => {
            switch (m.initializer?.kind) {
                case ts.SyntaxKind.StringLiteral:
                    // @ts-ignore
                    codefinition += `   ${m.name.escapedText} = '${m.initializer?.text}',`;
                    break;
                case ts.SyntaxKind.NumericLiteral:
                    // @ts-ignore
                    definition += `   ${m.name.escapedText} = ${m.initializer?.text},`;
                    break;
                default:
                    // @ts-ignore
                    definition += `   ${m.name.escapedText},`;
                    break;
            }

        });

        definition += `}\n`;

        typesDefinitions[name] = definition;

    }

    return !!enumDeclaration;

}

/**
 * @param {TsFile} file 
 * @param {string} name 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns 
 */
function renderClass(file, name, typesDefinitions) {

    const classDeclaration = file.classes.find(d => d.name.escapedText === name);

    if (classDeclaration) {

        let imports = '';
        let definition = '';

        const className = classDeclaration.name.escapedText;

        const importFound = (n = '') => {
            imports += `import { ${n} } from './${getName(n)}';\n`;
        }

        const classArguments = classDeclaration.typeParameters?.length ?
            '<' + classDeclaration.typeParameters.map(t => getType(t, file, typesDefinitions, importFound)).join(', ') + '>' : '';

        const classParents = classDeclaration.heritageClauses?.length ?
            ' extends ' + classDeclaration.heritageClauses.map(t => getType(t.types[0], file, typesDefinitions, importFound)).join(', ') : '';

        definition += `\nexport interface ${className}${classArguments}${classParents} {\n`;

        classDeclaration.members.forEach(m => {

            if (m.kind === ts.SyntaxKind.PropertyDeclaration) {
                // @ts-ignore
                definition += `    ${m.name.escapedText}: ${getType(m.type, file, typesDefinitions, importFound)};`;
            }

        });

        definition += `}\n`;

        typesDefinitions[name] = imports + definition;

    }

    return !!classDeclaration;

}

/**
 * @param {TsFile} file 
 * @param {string} name 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns 
 */
function renderType(file, name, typesDefinitions) {

    const localType = file.types.find(d => d.name.escapedText === name);

    if (localType) {

        let imports = '';
        let definition = '';

        function importFound(name = '') {
            imports += `import { ${name} } from './${getName(name)}';\n`;
        }

        const className = localType.name.escapedText;

        // @ts-ignore
        const separator = localType.type.kind === ts.SyntaxKind.IntersectionType ? ' & ' : ' | ';

        // @ts-ignore
        const options = localType.type.types.map(t => getType(t, file, typesDefinitions, importFound)).join(separator);

        definition += `\nexport type ${className} = ${options};\n`;

        typesDefinitions[name] = imports + definition;

    }

    return !!localType;

}

/**
 * @param {TsFile} file 
 * @param {string} name 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns 
 */
function addTypeDefinition(file, name, typesDefinitions, ns = '') {

    if (!name || typesDefinitions[name]) return;

    typesDefinitions[name] = '1';

    const rendered = renderInterface(file, name, typesDefinitions)
        || renderClass(file, name, typesDefinitions)
        || renderEnum(file, name, typesDefinitions)
        || renderType(file, name, typesDefinitions);

    if (!rendered) {

        delete typesDefinitions[name];

        const importStatement = ns
            ? file.imports.find(i => i.type === 'namespace' && i.namespace === ns)
            : file.imports.find(i => i.type === 'import' && i.members.includes(name));

        if (importStatement) {
            if (importStatement.path.startsWith('.')) {
                const importPath = path.resolve(path.dirname(file.path), importStatement.path + '.ts');
                const importedFile = openFile(importPath);
                addTypeDefinition(importedFile, name, typesDefinitions);
            }
        }

    }

}

/**
 * @param {any} type 
 * @param {TsFile} file 
 * @param {{[key:string]:string}} typesDefinitions 
 * @returns {string}
 */
function getType(type, file, typesDefinitions, callback = (n) => { }) {

    switch (type.kind) {
        case ts.SyntaxKind.ObjectKeyword:
            return 'object';
        case ts.SyntaxKind.BooleanKeyword:
            return 'boolean';
        case ts.SyntaxKind.NumberKeyword:
            return 'number';
        case ts.SyntaxKind.StringKeyword:
            return 'string';
        case ts.SyntaxKind.LiteralType:
            return `'${type.literal.text}'`;
        case ts.SyntaxKind.TypeReference:
            const typeName = type.typeName.kind === ts.SyntaxKind.QualifiedName
                ? type.typeName.right.escapedText : type.typeName.escapedText;
            callback(typeName);
            addTypeDefinition(file, typeName, typesDefinitions, type.typeName.left?.escapedText);
            if (type.typeArguments?.length) {
                return typeName + '<' + type.typeArguments.map(t => getType(t, file, typesDefinitions, callback)).join(', ') + '>';
            } else {
                return typeName;
            }
        case ts.SyntaxKind.ExpressionWithTypeArguments:
            const name = type.expression.escapedText;
            addTypeDefinition(file, name, typesDefinitions, type.typeName.left?.escapedText);
            if (type.typeArguments?.length) {
                return name + '<' + type.typeArguments.map(t => getType(t, file, typesDefinitions, callback)).join(', ') + '>';
            } else {
                return name;
            }
        case ts.SyntaxKind.ArrayType:
            return getType(type.elementType, file, typesDefinitions) + '[]';
        case ts.SyntaxKind.TypeLiteral:
            return '{ ' + type.members.map(m => m.name?.escapedText + ': ' + getType(m.type, file, typesDefinitions, callback) + ';').join(';') + ' }';
        case ts.SyntaxKind.TypeParameter:
            return type.name.escapedText;

        default:
            return 'unknown';

    }

}

/**
 * @param {TsFile} file 
 * @param {any} cls 
 * @returns {string[]}
 */
function getHeritageClasses(file, cls, ns = '') {
    const arr = [];
    cls.heritageClauses?.forEach(h => {
        h.types.forEach(t => { // @ts-ignore

            arr.push({
                name: t.expression.escapedText,
                args: t.typeArguments?.map(t => t.typeName)
            });

            const localClass = file.classes.find(c => c.name.escapedText === t.expression.escapedText);
            if (localClass) arr.push(...getHeritageClasses(file, localClass));

            const importStatement = ns
                ? file.imports.find(i => i.type === 'namespace' && i.namespace === ns)
                : file.imports.find(i => i.type === 'import' && i.members?.includes(t.expression.escapedText));

            if (importStatement) {
                if (importStatement.path.startsWith('.')) {
                    const importPath = path.resolve(path.dirname(file.path), importStatement.path + '.ts');
                    const importedFile = openFile(importPath);
                    const importedClass = importedFile.classes.find(c => c.name.escapedText === t.expression.escapedText);
                    if (importedClass) arr.push(...getHeritageClasses(importedFile, importedClass));
                }
            }
        });
    });
    return arr;
}

/**
 * @param {string} filePath 
 * @param {FunctionDefinition[]} functionsDefinitions
 */
function processFile(filePath, functionsDefinitions, typesDefinitions) {

    const LAMBDA_DECORATOR = 'LambdaFunction';
    const BASE_CLASS = 'Handler';

    const file = openFile(filePath);

    var decoratedClasses = file.classes // @ts-ignore
        .filter(s => s.decorators?.some(d => d.expression.expression.escapedText === LAMBDA_DECORATOR));

    var exportedVariables = file.source.statements
        .filter(s => s.kind === ts.SyntaxKind.VariableStatement
            && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));

    exportedVariables.forEach(v => {
        // @ts-ignore
        v?.declarationList?.declarations?.forEach(d => {

            const cls = decoratedClasses
                .find(c => c.name.escapedText === d.initializer.expression?.expression?.escapedText);

            if (cls) {

                const decorator = cls.decorators // @ts-ignore
                    ?.find(d => d.expression.expression.escapedText === LAMBDA_DECORATOR);

                if (!decorator)
                    return;

                // @ts-ignore
                const decoratorParams = extractLiteral(decorator.expression.arguments[0]);

                const def = {
                    path: filePath,
                    func: decoratorParams, // @ts-ignore
                    name: cls.name.escapedText?.toString(),
                    handler: d.name.escapedText,
                    imports: [],
                    parameters: [],
                    returnType: 'any',
                    httpPath: '',
                    httpMethod: '',
                };

                Object.keys(decoratorParams.Properties.Events).forEach(event => {
                    if (decoratorParams.Properties.Events[event].Type === 'Api') {
                        def.httpPath = decoratorParams.Properties.Events[event].Properties.Path;
                        def.httpMethod = decoratorParams.Properties.Events[event].Properties.Method;
                    }
                });

                function importFound(n) {
                    def.imports.push(n);
                }

                functionsDefinitions.push(def);

                /** @type {ts.MethodDeclaration} */ // @ts-ignore
                const method = cls.members.find(m => m.kind === ts.SyntaxKind.MethodDeclaration && m.name.escapedText === 'handle');

                if (!method) return;

                method.parameters.forEach(p => { // @ts-ignore
                    const source = p.decorators[0]?.expression.expression.escapedText || 'FromQuery';
                    def.parameters.push({
                        source: source,
                        type: getType(p.type, file, typesDefinitions, importFound), // @ts-ignore
                        name: p.name.escapedText,
                    });
                });

                //@ts-ignore
                cls.heritageClauses.forEach(h => {
                    h.types.forEach(t => { // @ts-ignore
                        if (t.expression.escapedText.endsWith('Handler') && t.typeArguments[0]) {
                            def.returnType = getType(t.typeArguments[0], file, typesDefinitions, importFound);
                        }
                    });
                });

            }
        });
    });

}

/**
 * @param {string} dir 
 * @returns {string[]}
 */
function getFilesRecursive(dir = '') {
    return fs.readdirSync(dir).flatMap((item) => {
        const path = `${dir}/${item}`;
        if (fs.statSync(path).isDirectory()) {
            if (['dist', 'node_modules', '.aws', '.aws-sam'].includes(item))
                return [];
            return getFilesRecursive(path);
        }
        return path;
    }).filter(f => f.endsWith('.ts'));
}

/**
 * @param {string} output
 * @param {FunctionDefinition[]} functionsDefinitions 
 */
function renderApi(output, functionsDefinitions) {

    let imports = ``;

    imports += `import { BASE_URL } from './baseurl.token';\n`;
    imports += `import { HttpClient } from '@angular/common/http';\n`;
    imports += `import { Injectable, Inject, Optional } from '@angular/core';\n`;

    functionsDefinitions.reduce((acc, c) => {
        acc.push(...c.imports);
        return acc;
    }, []).filter((v, i, s) => s.indexOf(v) === i).forEach(n => {
        imports += `import { ${n} } from './${getName(n)}';\n`;
    });

    let code = ``;

    code += `\n@Injectable()\n`;
    code += `export class ApiService {\n\n`;
    code += `    constructor(\n`;
    code += `        @Optional() @Inject(BASE_URL) private readonly baseUrl: string,\n`;
    code += `        private readonly http: HttpClient,\n`;
    code += `    ) {\n`;
    code += `        this.baseUrl = baseUrl || '';\n`
    code += `    }\n\n`;

    functionsDefinitions.forEach(func => {

        if (!func.httpMethod || !func.httpPath) return;

        let name = func.name.replace(/Function$/, '');
        name = name[0].toLowerCase() + name.substring(1);

        const method = func.httpMethod.toLowerCase();
        const params = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
        const bodyParam = func.parameters.find(p => p.source === 'FromBody');
        const args = method === 'post' || method === 'put'
            ? ['url', bodyParam ? bodyParam.name : 'null', 'options'].join(', ')
            : ['url', 'options'].join(', ');
        const queryParams = func.parameters.filter(p => p.source === 'FromQuery');
        const url = func.httpPath.replace(/(\{\w+\})/g,
            r => `\${encodeURIComponent(${r.substring(1, r.length - 1)})}`);

        code += `    public ${name}(${params}) {\n`;
        code += `        const url = this.baseUrl + \`${url}\`;\n`;
        code += `        const options = { headers: {} as any, params: null as any };\n`;
        code += `        options.headers['Accept'] = 'application/json';\n`;
        if (method === 'post' || method === 'put') {
            code += `        options.headers['Content-Type'] = 'application/json';\n`;
        }
        if (queryParams.length) {
            const query = queryParams.map(p => p.name).join(', ');
            code += `        options.params = { ${query} };\n`;
        }
        code += `        return this.http.${method}<${func.returnType}>(${args});\n`;
        code += `    }\n\n`;

    });

    code += `}\n`;

    fs.writeFileSync(path.join(output, `api.service.ts`), imports + code);
}


function writeBaseUrl(output) {
    let code = '';
    code += `import { InjectionToken } from '@angular/core';\n\n`;
    code += `export const BASE_URL = new InjectionToken<string>('BASE_URL');\n`;
    fs.writeFileSync(path.join(output, 'baseurl.token.ts'), code);
}

/**
 * @param {string} output
 * @param {FunctionDefinition[]} functionsDefinitions 
 */
function writeApiModule(output, functionsDefinitions) {
    let code = '';
    code += `import { HttpClientModule } from '@angular/common/http';\n`;
    code += `import { NgModule } from '@angular/core';\n\n`;
    code += `import { ApiService } from './api.service';\n`;

    code += `\n@NgModule({\n`;
    code += `    imports: [HttpClientModule],\n`;
    code += `    providers: [\n`;
    code += `        ApiService,\n`;
    code += `    ]\n`;
    code += `})\n`;
    code += `export class ApiModule {\n`;
    code += `}\n`;
    fs.writeFileSync(path.join(output, 'api.module.ts'), code);
}

/**
 * @param {string} output
 * @param {FunctionDefinition[]} functionsDefinitions 
 */
function writeIndex(output, functionsDefinitions) {

    let code = ``;

    code += `export { ApiModule } from './api.module';\n`
    code += `export { ApiService } from './api.service';\n`
    code += `export { BASE_URL } from './baseurl.token';\n`

    functionsDefinitions.reduce((acc, c) => {
        acc.push(...c.imports);
        return acc;
    }, []).filter((v, i, s) => s.indexOf(v) === i).forEach(n => {
        code += `export { ${n} } from './${getName(n)}';\n`;
    });

    fs.writeFileSync(path.join(output, 'index.ts'), code);

}


/**
 * @typedef Config
 * @property template: string 
 * @property tsconfig: string 
 * @property output: string 
 */

async function main() {

    const CONFIG_FILE = 'samgen.json';
    const cwd = process.cwd();

    if (!fs.existsSync(CONFIG_FILE))
        throw new Error(`No "${CONFIG_FILE}" file found!`);

    /** @type {Config} */
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

    if (!config.template) config.template = 'template.yaml';
    if (!config.tsconfig) config.template = 'tsconfig.yaml';

    if (!config.output)
        throw new Error('No output configured!');

    if (!fs.existsSync(config.template))
        throw new Error(`No "${config.template}" file found!`);

    if (!fs.existsSync(config.tsconfig))
        throw new Error(`No "${config.tsconfig}" file found!`);

    config.output = path.resolve(cwd, config.output);

    if (!fs.existsSync(config.output))
        fs.mkdirSync(config.output, { recursive: true });

    fs.readdirSync(config.output)
        .filter(file => file.endsWith('.ts'))
        .forEach(file => fs.unlinkSync(path.join(config.output, file)));

    const tsconfig = JSON.parse(fs.readFileSync(config.tsconfig, 'utf8'));
    const template = YAML.parse(fs.readFileSync(config.template, 'utf8'), { logLevel: 'error' });

    //console.dir(template, { depth: null });

    /** @type {FunctionDefinition[]} */
    const functionsDefinitions = [];

    /** @type {{[key:string]:string}} */
    const typesDefinitions = {};

    getFilesRecursive(cwd).forEach(f => processFile(f, functionsDefinitions, typesDefinitions));

    if (!template.Resources) {
        template.Resources = {};
    } else {
        Object.keys(template.Resources)
            .filter(key => template.Resources[key].Type === 'AWS::Serverless::Function')
            .forEach(key => delete template.Resources[key]);
    }

    functionsDefinitions.forEach(def => {

        /** @type {AWS.Function} */
        const func = def.func;

        const handlerPath = def.path.replace(cwd + '/', '');

        func.Type = 'AWS::Serverless::Function';

        if (!func.Metadata) func.Metadata = {};
        if (!func.Properties) func.Properties = { Events: {} };
        if (!func.Metadata.BuildProperties) func.Metadata.BuildProperties = {};

        func.Metadata.BuildMethod = 'esbuild';
        func.Metadata.BuildProperties.EntryPoints = [handlerPath];
        func.Properties.Handler = handlerPath.replace(/ts$/, def.handler);

        if (!func.Metadata.BuildProperties.Minify)
            func.Metadata.BuildProperties.Minify = false;

        if (!func.Metadata.BuildProperties.Target)
            func.Metadata.BuildProperties.Target = tsconfig?.compilerOptions?.target === undefined
                ? 'es2020' : tsconfig?.compilerOptions?.target;

        if (!func.Metadata.BuildProperties.Sourcemap)
            func.Metadata.BuildProperties.Sourcemap = tsconfig?.compilerOptions?.sourceMap === undefined
                ? false : tsconfig?.compilerOptions?.sourceMap;

        template.Resources[def.name] = func;

    });

    fs.writeFileSync(config.template, YAML.stringify(template).replace(/"!(.+)"/g, '!$1'));

    Object.keys(typesDefinitions).forEach(name => {
        fs.writeFileSync(path.join(config.output, `${getName(name)}.ts`), typesDefinitions[name]);
    });

    console.log(functionsDefinitions);

    renderApi(config.output, functionsDefinitions);

    writeBaseUrl(config.output);
    writeIndex(config.output, functionsDefinitions);
    writeApiModule(config.output, functionsDefinitions);

}

main().catch(console.log);

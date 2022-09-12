export namespace AWS {

    export interface VpcConfig {
        SubnetIds: string[];
        SecurityGroupIds: string[];
    }

    export interface ProvisionedConcurrencyConfig {
        ProvisionedConcurrentExecutions: number;
    }

    export interface ImageConfig {
        Command: string[];
        EntryPoint: string[];
        WorkingDirectory: string;
    }

    export interface Cors {
        AllowCredentials: boolean;
        AllowHeaders: string[];
        AllowMethods: string[];
        AllowOrigins: string[];
        ExposeHeaders: string[];
        MaxAge: number;
    }

    export interface FunctionUrlConfig {
        AuthType: 'AWS_IAM' | 'NONE';
        Cors?: Cors;
    }

    export interface OnFailure {
        Destination: String;
        Type?: String;
    }

    export interface OnSuccess {
        Destination: String;
        Type?: String;
    }

    export interface EventInvokeDestinationConfiguration {
        OnFailure?: OnFailure;
        OnSuccess?: OnSuccess;
    }

    export interface EventInvokeConfiguration {
        DestinationConfig: EventInvokeDestinationConfiguration;
        MaximumEventAgeInSeconds: number
        MaximumRetryAttempts: number;
    }

    export interface EphemeralStorage {
        Size: number;
    }

    export interface Environment {
        Variables: string[];
    }

    export interface Hooks {
        PostTraffic: string;
        PreTraffic: string;
    }

    export interface DeploymentPreference {
        Alarms: string[];
        Enabled: boolean;
        Hooks: Hooks
        PassthroughCondition: boolean;
        Role: string;
        TriggerConfigurations: string[]
        Type: string;
    }

    export interface DeadLetterQueue {
        TargetArn: string;
        Type: string;
    }

    export interface FunctionCode {
        Bucket: string;
        Key: string;
        Version?: string;
    }

    export type EventSourceType = 'S3' | 'SNS' | 'Kinesis' | 'DynamoDB' | 'SQS' | 'Api' | 'Schedule' | 'CloudWatchEvent' | 'CloudWatchLogs' | 'IoTRule' | 'AlexaSkill' | 'Cognito' | 'EventBridgeRule' | 'HttpApi' | 'MSK' | 'MQ' | 'SelfManagedKafka';

    export interface ResourcePolicyStatement {
        AwsAccountBlacklist?: string[];
        AwsAccountWhitelist?: string[];
        CustomStatements?: string[];
        IntrinsicVpcBlacklist?: string[];
        IntrinsicVpcWhitelist?: string[];
        IntrinsicVpceBlacklist?: string[];
        IntrinsicVpceWhitelist?: string[];
        IpRangeBlacklist?: string[];
        IpRangeWhitelist?: string[];
        SourceVpcBlacklist?: string[];
        SourceVpcWhitelist?: string[];
    }

    export interface ApiFunctionAuth {
        ApiKeyRequired?: boolean;
        AuthorizationScopes?: string[];
        Authorizer?: string;
        InvokeRole?: string;
        ResourcePolicy?: ResourcePolicyStatement;
    }

    export interface RequestParameter {
        Caching: boolean;
        Required: boolean;
    }

    export interface RequestModel {
        Caching: boolean;
        Required: boolean;
    }

    export interface Api {
        Auth?: ApiFunctionAuth;
        Method: string;
        Path: string;
        RequestModel?: RequestModel;
        RequestParameters?: string | RequestParameter
        RestApiId?: string;
    }

    export interface Filter {
        Pattern: String
    }

    export interface FilterCriteria {
        Filters: Filter;
    }

    export interface SQS {
        BatchSize?: number;
        Enabled?: boolean;
        FilterCriteria?: FilterCriteria;
        MaximumBatchingWindowInSeconds?: number;
        Queue: string;
    }

    export interface DeadLetterConfig {
        Arn?: string;
        QueueLogicalId?: string;
        Type?: string;
    }

    export interface RetryPolicy {
        MaximumEventAgeInSeconds?: number;
        MaximumRetryAttempts?: number;
    }

    export interface Schedule {
        DeadLetterConfig?: DeadLetterConfig;
        Description?: string;
        Enabled?: boolean;
        Input?: string;
        Name?: string;
        RetryPolicy?: RetryPolicy;
        Schedule: string;
    }

    export interface EventSource {
        Type: EventSourceType;
        Properties: Api | Schedule | SQS;
    }

    export interface FunctionProperties {
        Architectures?: string[];
        AssumeRolePolicyDocument?: JSON
        AutoPublishAlias?: string;
        AutoPublishCodeSha256?: string;
        CodeSigningConfigArn?: string;
        CodeUri?: string | FunctionCode;
        DeadLetterQueue?: { [key: string]: string } | DeadLetterQueue;
        DeploymentPreference?: DeploymentPreference;
        Description?: string;
        Environment?: Environment;
        EphemeralStorage?: EphemeralStorage;
        EventInvokeConfig?: EventInvokeConfiguration;
        Events: { [key: string]: EventSource };
        FileSystemConfigs?: string[];
        FunctionName?: string;
        FunctionUrlConfig?: FunctionUrlConfig;
        Handler?: string;
        ImageConfig?: ImageConfig;
        ImageUri?: string;
        InlineCode?: string;
        KmsKeyArn?: string;
        Layers?: string[];
        MemorySize?: number;
        PackageType?: string;
        PermissionsBoundary?: string;
        Policies?: string | string[] | { [key: string]: string };
        ProvisionedConcurrencyConfig?: ProvisionedConcurrencyConfig;
        ReservedConcurrentExecutions?: number;
        Role?: string;
        Runtime?: string;
        Tags?: { [key: string]: string };
        Timeout?: number;
        Tracing?: string;
        VersionDescription?: string;
        VpcConfig?: VpcConfig;
    }

    export interface FunctionBuildProperties {
        Minify?: boolean;
        Target?: 'es2020';
        Sourcemap?: boolean;
        EntryPoints?: string[];
    }

    export interface FunctionMetadata {
        BuildMethod?: 'esbuild';
        BuildProperties?: FunctionBuildProperties;
    }

    export interface Function {
        Type?: 'AWS::Serverless::Function';
        Properties: FunctionProperties;
        Metadata?: FunctionMetadata;
    }
}

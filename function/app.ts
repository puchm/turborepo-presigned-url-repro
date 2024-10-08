import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner';
import { JwtPayload, verify } from 'jsonwebtoken';
import { parseUrl } from '@smithy/url-parser';
import { Hash } from '@smithy/hash-node';
import { HttpRequest } from '@smithy/protocol-http';
import { formatUrl } from '@aws-sdk/util-format-url';

const UNAUTHORIZED = 'Unauthorized';

const notFound = (message: string) => {
    console.log('NOTFOUND', message);

    return {
        statusCode: 404,
        body: `Not found ${message}`,
    } as const;
};

const env = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing environment variable ${key}`);
    return value;
};

const envDefault = <T>(key: string, fallback: T): string | T => {
    try {
        return env(key);
    } catch {}
    return fallback;
};

type TeamToken = JwtPayload & { teamId: string };

function assertTeamToken(token: unknown): asserts token is TeamToken {
    const teamId = (token as any)?.teamId;
    if (typeof teamId !== 'string' || !/^team_\w+$/.test(teamId)) throw new Error("Invalid token 'teamId'");
}

const authenticate = (authorization: string) => {
    try {
        console.log('authorizing', authorization);
        const token = verify(authorization.replace('Bearer ', ''), env('JWT_SECRET'));
        console.log(token);
        assertTeamToken(token);
        return token;
    } catch (e) {
        console.log('intermediary error', e);
        throw new Error(UNAUTHORIZED);
    }
};

const generatePresignedUrl = async (
    method: 'GET' | 'PUT',
    region: string,
    bucket: string,
    key: string,
    teamId: string,
) => {
    const url = parseUrl(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
    const presigner = new S3RequestPresigner({
        credentials: {
            accessKeyId: env('AWS_ACCESS_KEY_ID'),
            secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
            sessionToken: envDefault('AWS_SESSION_TOKEN', undefined),
        },
        region,
        sha256: Hash.bind(null, 'sha256'),
    });
    const req = new HttpRequest({ ...url, method });
    req.query.teamId = teamId;
    const signedUrlObject = await presigner.presign(req, { expiresIn: 3600 });
    return formatUrl(signedUrlObject);
};

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log(event);
    const {
        path,
        queryStringParameters,
        httpMethod,
        headers: {
            Authorization = '',
            'access-control-request-method': requestMethod,
            'x-forwarded-proto': protocol,
            host: host,
        },
    } = event;

    const location = new URL(`${protocol}://${host}${path}`);

    for (const [key, value] of Object.entries(queryStringParameters || {})) {
        if (value !== undefined) {
            location.searchParams.append(key, value);
        }
    }

    if (!location.pathname.startsWith('/v8/artifacts')) return notFound('url does not start with /v8/artifacts');

    switch (`${httpMethod}:${location.pathname}`) {
        case 'GET:/v8/artifacts/status':
            console.log('STATUS ROUTE');
            return {
                statusCode: 200,
                body: '{"enabled":true}',
            };
        case 'POST:/v8/artifacts/events':
            console.log('EVENTS ROUTE');
            return {
                statusCode: 200,
                body: '{}',
            };
        default:
            try {
                console.log('HTTP METHOD', httpMethod, 'REQUEST METHOD', requestMethod, 'LOCATION', location.pathname);
                const [, , , hash] = location.pathname.split('/');
                if (!hash || httpMethod !== 'OPTIONS')
                    return notFound(`hash (${hash}) unknown or method (${httpMethod}) not OPTIONS`);
                const { teamId } = authenticate(Authorization);
                const Key = `${teamId}/${hash}`;
                if (requestMethod === 'GET' || requestMethod === 'PUT') {
                    console.log('RETURNING presigned url');
                    return {
                        statusCode: 200,
                        headers: {
                            location: await generatePresignedUrl(
                                requestMethod,
                                env('AWS_REGION'),
                                env('S3_BUCKET'),
                                Key,
                                teamId,
                            ),
                        },
                        body: '',
                    } as const;
                }
                return notFound('other');
            } catch (e: any) {
                console.log('GOT AN ERROR', e);
                if (e.message !== UNAUTHORIZED) throw e;
                return {
                    statusCode: 401,
                    body: UNAUTHORIZED,
                };
            }
    }
};

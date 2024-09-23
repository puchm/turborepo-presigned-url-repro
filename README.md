# [Original repository](https://github.com/EloB/turborepo-remote-cache-lambdagit )

# Explanation
- Install (SAM)[https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html]
- Set up AWS account and credentials
- Create S3 Bucket
    - Bucket policy (quite permissive, but good enough for debugging): 
```
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com"
        },
        "Action": "s3:*",
        "Resource": [
          "arn:aws:s3:::YOUR_BUCKET_NAME",
          "arn:aws:s3:::YOUR_BUCKET_NAME/*"
        ]
      }
    ]
  }
```

- Create JWT, e.g. on https://jwt.io/ as detailed below
    - Note that the `team_` is mandatory and the part after should only contain alphanumeric characters and underscores
- `npm --prefix=function install`
- Run `sam build`
- Run `sam deploy --guided`
    - Region must be same as where Bucket is located
    - JWT secret is the secret used to create the JWT, not the JWT itself
    - S3Bucket is only the name of the bucket, without the protocol or anything
- Set up environment
    - `TURBO_TOKEN` must be set to JWT created before
    - `.turbo/config.json` as detailed below, the API URL is in the output of `sam deploy`
- Navigate into `app` folder
- `pnpm install` / `npm install` / or other
- `pnpm tbuild`, optionally with `--verbosity=2` or higher
    - This will fail with the error down below
    - When downgrading turbo, it will start to work starting in version 1.13.3. It does not work in 1.13.4.
- **Remember to run `sam delete` when you're done**

## Error:
```
WARNING  failed to contact remote cache: Error making HTTP request: HTTP status server error (501 Not Implemented) for url [presigned url]
```


---
---
---

# Original Readme down below

# Self hosted Turborepo Remote Cache Lambda
Using Turborepo preflight requests combined with Lambda and S3 to generate presigned URLs which allows files larger than 6MB.

## Installation:
First create an private S3 Bucket then add some "Lifecycle rules" to delete old files after awhile to save storage.

```bash
git clone git@github.com:EloB/turborepo-remote-cache-lambda.git
cd turborepo-remote-cache-lambda/
npm --prefix=function install
sam build
zip -j app.zip .aws-sam/build/TurboRepoRemoteCacheFunction/*
```
Then create a Lambda function in AWS Console and upload this zip file. Give it permissions to the S3 bucket. Add a function url to it. Add `JWT_SECRET` and `S3_BUCKET` as environment variables.

## Usage:

### Create `.turbo/config.json` in your monorepo to enable remote caching.
```json
{
  "teamid": "team_yourteamhere",
  "apiurl": "https://YOUR-LAMBDA-URL.lambda-url.eu-central-1.on.aws"
}
```

### Generate a JWT token.
Simpliest way is going to https://jwt.io/ and create one. Enter you `JWT_SECRET` in the `your-256-bit-secret` field and set that payload from the image and define a name.
![image](https://github.com/EloB/turborepo-remote-cache-lambda/assets/476567/109f84c2-7dbd-4aed-a74b-c50279b6aced)

### Executing turbo tasks
Don't forget to set the environment `TURBO_TOKEN` when running a turbo task. Important also that you apply the `--preflight` to the commands when executing for instance `turbo build --preflight` else it won't work. There should be an dedicated environment variable for that but hasn't able to work (see `TURBO_PREFLIGHT` at https://turbo.build/repo/docs/reference/system-variables#system-environment-variables).

## Todo
- Simplify the deployment using `sam deploy` and parameter overrides. Accepting PRs for this!

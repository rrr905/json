import { ProbotOctokit } from 'probot'
import {ComplianceCheck, ComplianceModule, ComplianceModuleConfig, RepositoryReference, Result} from './commons'

import Ajv, { ErrorObject } from 'ajv'
import JSONPointer from 'jsonpointer';

import fs from 'fs';

//add product JSON path here
const path = './product.json';

export = {
    name: 'product_ci_schema',
    config_key: 'product_ci_schema',
    check: do_check as ComplianceCheck,
    config: async ()=>({
        title: "`product.json` Validation",
        schema : {
            owner: process.env.MOBILE_SEED_JOB_REPO?.split('/', 1)?.[0] ?? 'mobile',
            repo: process.env.MOBILE_SEED_JOB_REPO?.split('/', 1)?.[1] ?? 'ci-script-mobileci',
            ref: process.env.MOBILE_SEED_JOB_REPO_SRC_REF ?? 'heads/master',
            path: "mobile_metadata/schemas/product_ci_schema"
        },
        target_path: "product.json"
    })
} as ComplianceModule

interface SchemaValidatorConfig extends ComplianceModuleConfig{
    schema : RepositoryReference & {path: string};
    target_path: string
}

async function do_check(repo_ref: RepositoryReference, octokit: InstanceType<typeof ProbotOctokit>, config: SchemaValidatorConfig): Promise<Result> {

    //load schema

    const schema = await octokit.repos.getContent({
        ...config.schema,
        mediaType: { format: 'raw'}
        /* @ts-ignore mediatype: raw returns the raw file content directly not a data object */
    }).then(r=>JSON.parse(r.data))

    //load product.json
    const product_ci = await octokit.repos.getContent({
        path: config.target_path,
        mediaType: { format: 'raw'}
        /* @ts-ignore mediatype: raw returns the raw file content directly not a data object */
    }).then(r=>JSON.parse(r.data))

    //validate mbile-ci with schema
    const ajv = new Ajv()
    const validate = ajv.compile(schema)
    const valid = false;
	
	
	try {
	  if (fs.existsSync(path)) {
		valid=false
	  }
	} catch(err) {
	  console.error(err)
	}
	
	
	const valid = validate(product_ci)
	


    return {
        result: valid,
        summary: `product.json validation : ${valid ? 'Passed' : 'Failed' }`,
        details: `
${valid ? "No Errors" : formatErrors(validate.errors!,product_ci,schema)}
### Details
Repository:    ${repo_ref.owner}/${repo_ref.repo}
Schema: ${config.schema.owner}/${config.schema.repo}@${config.schema.ref}:/${config.schema.path}
`
    }
}

function formatErrors<T extends ErrorObject>(errors: T[], file: Object, schema: Object){
    return errors.map((e: ErrorObject)=>
`### Error: ${e.message}
Pointer: ${e.instancePath}
Value:
${JSON.stringify(JSONPointer.get(file,e.instancePath))}
#### Schema:
Pointer: ${e.schemaPath}
${JSON.stringify(JSONPointer.get(schema,e.schemaPath))}
`)
}

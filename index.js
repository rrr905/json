import { Context, Probot, ProbotOctokit } from 'probot';

import { ComplianceModule, ComplianceModuleConfig, RepositoryReference, Result } from './commons';

import SonarQube from './sonarqube'
import SharedPipeline from './shared_pipeline'
import MobileCiValidator from './json_schema_validator'
import GradleValidator from './gradle_validator'

interface Configuration{
    app_api_name: string; //short kebab-case name
    app_name: string;
    modules: Record<string, ComplianceModuleConfig>
}

let complianceChecks: ComplianceModule[] = [SharedPipeline,SonarQube, MobileCiValidator, GradleValidator ]
// let defaultConfig: Configuration = {app_api_name: 'compliance-bot', app_name: 'Compliance Bot', modules: {}}
let defaultConfig: Configuration = {app_api_name: 'compliance-bot', app_name: 'Compliance Bot', modules: {}}

export = async (app: Probot) => {
    app.log.info("Starting up")
    let configPromise = Promise.all(complianceChecks.map(async (cm)=>cm.config().then((c)=>defaultConfig.modules[cm.config_key]=c).then(()=>app.log.info({module: cm.config_key}, "Module config loaded")))).then(()=>defaultConfig)
    let configFile = 'compliance-bot' + (process.env.NODE_ENV == 'production' ? '' : '.dev') + '.yml'
    app.log.info("Config loaded")

    app.on("check_suite.requested", async (context) => {
        let config = await context.config(configFile, await configPromise).then((c)=>{if (!c) {throw Error('Undefined configuration loading error')} else return c})
        context.log.info({ repo: context.repo(), action: context.payload.action, app: context.payload.check_suite.app }, "Check_Suite requested event")
        await run_all_compliance_checks(context, config, context.payload.check_suite)
    })

    app.on("check_run.rerequested", async (context) => {
        let config = await context.config(configFile, await configPromise).then((c)=>{if (!c) {throw Error('Undefined configuration loading error')} else return c})

        context.log.info({ repo: context.repo(), eventId: context.id, action: context.payload.action, app: context.payload.check_run.check_suite.app }, "Check_run Rerequested event")
        await run_all_compliance_checks(context, config, context.payload.check_run.check_suite)
    })

    /* @ts-ignore */
    app.onAny((c)=>c.log.info({ event: c.name, action: c.payload?.action}))
};

type CheckSuite = Context<'check_suite'>['payload']['check_suite'] | Context<'check_run'>['payload']['check_run']['check_suite']
async function run_all_compliance_checks(context: Context, config: Configuration, check_suite: CheckSuite){
    return Promise.all(complianceChecks.map((m)=>run_compliance_check(context.octokit,context.log.child({repo: context.repo(), module: m.name}),m,config,(o)=>context.repo(o),check_suite)))
}

async function run_compliance_check(octokit: InstanceType<typeof ProbotOctokit>,log: ReturnType<Context['log']['child']>,  module: ComplianceModule, config: Configuration, repo: {(_:any):any}, {head_branch, head_sha}: {head_branch: String | null, head_sha: String | null }): Promise<Result> {
    if(!(new RegExp(config.modules[module.config_key].repo_pattern ?? /.*/).test(repo({}).repo))){
        log.info('Not applicable for this repo')
        return Promise.resolve({
            result: true,
            summary: "Not applicable",
            details: ""
        })
    }

    log.info({head_branch, head_sha},"Creating check_run")
    let check_run = await octokit.checks.create(
        repo(
            {
                mediaType: { previews: ['antiope'] },
                name: `${config.app_api_name}/${module.name}`,
                head_branch: head_branch,
                head_sha: head_sha,
                status: "in_progress"
            }
        )
    )

    let repo_ref: RepositoryReference = repo({ ref: head_sha })

    let result: Result = await module.check(repo_ref,octokit,config.modules[module.config_key]).catch((e)=>({result: false, summary: `Error running check: ${module.name}`, details: e}))

    log.info({head_branch, head_sha, check_run_id: check_run.data.id, result: result.result},"Updating check_run")
    return await octokit.checks.update(
        repo({
            mediaType: { previews: ['antiope'] },
            check_run_id: check_run.data.id,
            conclusion: result.result ? 'success' : 'failure',
            completed_at: new Date().toISOString(),
            output: {
                title: `${config.app_name} - ${config.modules[module.config_key].title}`,
                summary: result.summary,
                text: result.details
            }
        })
    ).then((_)=>result)
}

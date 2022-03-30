import { ProbotOctokit } from "probot";

export {  ComplianceModuleConfig, ComplianceCheck, ComplianceModule, Repository, RepositoryReference, asRepo, Result, journeyLibraryType, getMessage};

interface ComplianceCheck {
    ( repo_ref: RepositoryReference, octokit: InstanceType<typeof ProbotOctokit>, config: object ): Promise<Result>;
}

interface ComplianceModule {
    name: string;
    config_key: string;
    check: ComplianceCheck;
    config: <T extends ComplianceModuleConfig>() => Promise<T>
}

interface ComplianceModuleConfig {
    title: string;
    repo_pattern?: string;
    messages?: Record<string,string>
}

interface Repository {
    owner: string;
    repo: string;
}

interface RepositoryReference extends Repository{
    ref: string;
}

function asRepo(repoRef: RepositoryReference): Repository{
    let { ref, ...repo} = repoRef;
    return repo
}

function journeyLibraryType(repo: Repository) {
    let parts = repo.repo.split('-')
    if(parts.length >= 3 && parts.pop() == 'lib'){ //shortest journey-<platform>-lib
        return parts.pop()
    }
    else return ''
}

interface Result {
    result: boolean;
    summary: string;
    details: string;
}

function getMessage(config: ComplianceModuleConfig, key: string){
    return config.messages?.[key] ?? key
}

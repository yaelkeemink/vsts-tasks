import path = require('path');
import tl = require('vsts-task-lib/task');
import { PrcaOrchestrator } from './PRCA/PrcaOrchestrator';
import { TaskLibLogger } from './TaskLibLogger';

tl.setResourcePath(path.join(__dirname, 'task.json'));

stopOnNonPrBuild();

var orchestrator: PrcaOrchestrator = PrcaOrchestrator.Create(
    new TaskLibLogger(),
    tl.getVariable('System.TeamFoundationCollectionUri'),
    getBearerToken(),
    tl.getVariable('Build.Repository.Id'),
    getPullRequestId(),
    getMessgeLimit());

orchestrator.postSonarQubeIssuesToPullRequest(tl.getVariable('PRCA_REPORT_PATH'))
    .then(() => {
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('Info_ResultSuccess')); // Set task success
    })
    .catch((error: any) => {
        tl.debug(`Task failed with the following error: ${error}`);
        // Looks like: "Pull Request Code Analysis failed."
        tl.setResult(tl.TaskResult.Failed, tl.loc('Info_ResultFail')); // Set task failure
    });




function stopOnNonPrBuild() {

    let sourceBranch: string = tl.getVariable('Build.SourceBranch');
    if (!sourceBranch.startsWith('refs/pull/')) {
        // Looks like: "Skipping pull request commenting - this build was not triggered by a pull request."
        console.log(tl.loc('Error_NotPullRequest'));
        process.exit();
    }
}

function getPullRequestId() {
    let sourceBranch: string = tl.getVariable('Build.SourceBranch');
    var pullRequestId: number = Number.parseInt(sourceBranch.replace('refs/pull/', ''));

    if (isNaN(pullRequestId)) {
        tl.debug(`Expected pull request ID to be a number. Attempted to parse: ${sourceBranch.replace('refs/pull/', '')}`);
        // Looks like: "Could not retrieve pull request ID from the server."
        tl.setResult(tl.TaskResult.Failed, tl.loc('Error_InvalidPullRequestId'));
        process.exit(1);
    }

    return pullRequestId;

}

function getMessgeLimit(): number {
    let messageLimitInput: string = tl.getInput('messageLimit');
    let messageLimit: number = ~~Number(messageLimitInput); // Convert to a number and truncate (~~) any fraction
    if (isNaN(messageLimit) // if a number could not be constructed out of messageLimitInput
        || String(messageLimit) !== messageLimitInput // or if the strings are not equal when converted back (should pass for expected number values)
        || messageLimit < 1) // or if the input was "0" or negative
    {
        // Looks like: "Expected message limit to be a number, but instead it was NOT_A_NUMBER"
        tl.setResult(tl.TaskResult.Failed, tl.loc('Error_InvalidMessageLimit', messageLimitInput));
        process.exit(1);
    }

    return messageLimit;
}

function getBearerToken() {

    // Get authentication from the agent itself
    var auth = tl.getEndpointAuthorization("SYSTEMVSSCONNECTION", false);
    if (auth.scheme !== "OAuth") {
        // Looks like: "Could not get an authentication token from the build agent."
        tl.error(tl.loc('Error_FailedToGetAuthToken'));
        // Looks like: "Pull Request Code Analysis failed."
        tl.setResult(tl.TaskResult.Failed, tl.loc('Info_ResultFail')); // Set task failure
        process.exit(1);
    }

    return auth.parameters["AccessToken"];
}
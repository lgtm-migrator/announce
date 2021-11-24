/* eslint-disable curly */
/* eslint-disable security-node/detect-non-literal-require-calls */
/* eslint-disable security/detect-non-literal-require */
/* eslint-disable security-node/non-literal-reg-expr */
/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable no-loop-func */
'use strict';

/**
 * Module dependencies, required for ALL Twy'r modules
 * @ignore
 */

/**
 * Module dependencies, required for this module
 * @ignore
 */

/**
 * @class		PublishCommandClass
 * @classdesc	The command class that handles all the publish operations.
 *
 * @param		{object} mode - Set the current run mode - CLI or API
 *
 * @description
 * The command class that implements the "publish" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class PublishCommandClass {
	// #region Constructor
	constructor(mode) {
		this.#execMode = mode;
	}
	// #endregion

	// #region Public Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof PublishCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to publish the Git Host release to NPM.
	 *
	 * This method does 2 things:
	 * - Gets the URL to the compressed asset for the last/specified release from the Git Host
	 * - Publishes the asset to NPM
	 *
	 */
	async execute(options) {
		// Step 1: Setup sane defaults for the options
		const mergedOptions = this._mergeOptions(options);

		// Step 2: Set up the logger according to the options passed in
		const logger = this._setupLogger(mergedOptions);
		mergedOptions.logger = logger;

		// Step 3: Setup the task list
		const taskList = this?._setupTasks?.();

		// Step 4: Run the tasks in sequence
		// eslint-disable-next-line security-node/detect-crlf
		console.log(`Publishing the release to NPM:`);
		await taskList?.run?.({
			'options': mergedOptions,
			'execError': null
		});
	}
	// #endregion

	// #region Private Methods
	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_mergeOptions
	 *
	 * @param		{object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return		{object} Merged options - input options > configured options.
	 *
	 * @summary  	Merges options passed in with configured ones - and puts in sane defaults if neither is available.
	 *
	 */
	_mergeOptions(options) {
		const mergedOptions = Object?.assign?.({}, options);
		return mergedOptions;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_setupLogger
	 *
	 * @param		{object} options - merged options object returned by the _mergeOptions method
	 *
	 * @return		{object} Logger object with info / error functions.
	 *
	 * @summary  	Creates a logger in CLI mode or uses the passed in logger object in API mode - and returns it.
	 *
	 */
	_setupLogger(options) {
		if(this.#execMode === 'api')
			return options?.logger;

		return null;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_setupTasks
	 *
	 * @return		{object} Tasks as Listr.
	 *
	 * @summary  	Setup the list of tasks to be run
	 *
	 */
	_setupTasks() {
		const Listr = require('listr');
		const taskList = new Listr([{
			'title': 'Initializing Git Client...',
			'task': this?._initializeGit?.bind?.(this)
		}, {
			'title': 'Fetching upstream repository info...',
			'task': this?._getUpstreamRepositoryInfo?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.options?.git)
					return false;

				return `No Git client found.`;
			}
		}, {
			'title': 'Publishing to npm...',
			'task': this?._publishToNpm?.bind?.(this),
			'skip': (ctxt) => {
				if(!ctxt?.options?.npmToken?.trim?.()?.length) return `Cannot publish without an NPM token.`;
				if(!ctxt?.options?.releaseToBePublished) return `Cannot publish without a release on the Git host.`;
				if(!ctxt?.options?.releaseToBePublished?.tarball_url) return `Cannot publish a release without a tarball.`;

				return false;
			}
		}], {
			'collapse': false
		});

		return taskList;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_initializeGit
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Creates a Git client instance for the current project repository and sets it on the context.
	 *
	 */
	_initializeGit(ctxt, task) {
		const simpleGit = require('simple-git');
		const git = simpleGit?.({
			'baseDir': ctxt?.options?.currentWorkingDirectory
		});

		ctxt?.options?.logger?.info?.(`Initialized Git for the repository @ ${ctxt?.options?.currentWorkingDirectory}`);
		task.title = `Initialize Git for the repository @ ${ctxt?.options?.currentWorkingDirectory}: Done`;

		ctxt.options.git = git;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_getUpstreamRepositoryInfo
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Retrieves the upstream repository information, and sets a POJO with that info into the context.
	 *
	 */
	async _getUpstreamRepositoryInfo(ctxt, task) {
		const gitRemote = await ctxt?.options?.git?.remote?.(['get-url', '--push', ctxt?.options?.upstream]);

		const hostedGitInfo = require('hosted-git-info');
		const repository = hostedGitInfo?.fromUrl?.(gitRemote);
		repository.project = repository?.project?.replace?.('.git\n', '');

		const GitHostWrapper = require(`./../git_host_utilities/${repository?.type}`)?.GitHostWrapper;
		const gitHostWrapper = new GitHostWrapper(ctxt?.options?.[`${repository?.type}Token`]);

		const releaseToBePublished = await gitHostWrapper?.fetchReleaseInformation?.(repository, ctxt?.options?.releaseName);
		if(!releaseToBePublished) throw new Error(`Unknown Release: ${ctxt?.options.releaseName}`);

		ctxt.options.repository = repository;
		ctxt.options.releaseToBePublished = releaseToBePublished;

		ctxt?.options?.logger?.info?.(`Fetch upstream repository info: Done`);
		task.title = `Fetch upstream repository info: Done`;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PublishCommandClass
	 * @name		_publishToNpm
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Retrieves the release assets from GitHub, and publishes them to NPM.
	 *
	 */
	async _publishToNpm(ctxt, task) {
		let distTag = null;
		if((ctxt?.options?.distTag ?? 'version_default') === 'version_default') {
			if(ctxt?.options?.releaseToBePublished?.prerelease)
				distTag = 'next';
			else
				distTag = 'latest';
		}

		const publishOptions = ['publish'];
		publishOptions?.push?.(ctxt?.options?.releaseToBePublished?.tarball_url);
		publishOptions?.push?.(`--tag ${distTag}`);
		publishOptions?.push?.(`--access ${ctxt?.options?.access}`);
		if(ctxt?.options?.dryRun) publishOptions?.push?.('--dry-run');

		const execa = require('execa');

		const publishProcess = execa?.('npm', publishOptions, { 'all': true });
		// publishProcess?.stdout?.pipe?.(process.stdout);
		// publishProcess?.stderr?.pipe?.(process.stderr);
		await publishProcess;

		ctxt?.options?.logger?.info?.(`Publish to NPM: Done`);
		task.title = `Publish to NPM: Done`;
	}
	// #endregion

	// #region Utility Methods
	async _sleep(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
	// #endregion

	// #region Private Fields
	#execMode = null;
	// #endregion
}

// Add the command to the cli
exports.commandCreator = function commandCreator(commanderProcess, configuration) {
	const Commander = require('commander');
	const publish = new Commander.Command('publish');

	// Get package.json into memory... we'll use it in multiple places here
	const path = require('path');
	const projectPackageJson = path.join((configuration?.publish?.currentWorkingDirectory?.trim?.() ?? process.cwd()), 'package.json');

	let pkg = null;
	try {
		pkg = require(projectPackageJson);
	}
	catch(err) {
		// Do nothing
		pkg = null;
	}

	if(pkg) {
		// Get the dynamic template filler - use it for configuration substitution
		const fillTemplate = require('es6-dynamic-template');

		if(configuration?.publish?.currentWorkingDirectory) {
			configuration.publish.currentWorkingDirectory = fillTemplate?.(configuration?.publish?.currentWorkingDirectory, pkg);
		}

		if(configuration?.publish?.releaseName) {
			configuration.publish.releaseName = fillTemplate?.(configuration?.publish?.releaseName, pkg);
		}
	}

	// Setup the command
	publish?.alias?.('pub');
	publish
		?.option?.('--current-working-directory <folder>', 'Path to the current working directory', configuration?.release?.currentWorkingDirectory?.trim?.() ?? process?.cwd?.())

		.option('--access <level>', 'Public / Restricted', configuration?.publish?.access?.trim?.() ?? 'public')
		.option('--dist-tag <tag>', 'Tag to use for the published release', configuration?.publish?.distTag?.trim?.() ?? 'latest')
		.option('--dry-run', 'Dry run publish', configuration?.publish?.dryRun ?? false)

		.option('--github-token <token>', 'Token to use for accessing the release on GitHub', configuration?.publish?.githubToken?.trim?.() ?? process.env.GITHUB_TOKEN ?? 'PROCESS.ENV.GITHUB_TOKEN')
		.option('--gitlab-token <token>', 'Token to use for accessing the release on GitLab', configuration?.publish?.gitlabToken?.trim?.() ?? process.env.GITLAB_TOKEN ?? 'PROCESS.ENV.GITLAB_TOKEN')
		.option('--npm-token <token>', 'Automation Token to use for publishing the release to NPM', configuration?.publish?.npmToken?.trim?.() ?? process.env.NPM_TOKEN ?? 'PROCESS.ENV.NPM_TOKEN')

		.option('--release-name <name>', 'Release name on the Git Host for fetching the compressed assets', configuration?.publish?.releaseName?.trim?.() ?? (pkg ? `V${pkg?.version} Release` : 'Release'))
		.option('--upstream <remote>', 'Git remote to use for accessing the release', configuration?.publish?.upstream ?? 'upstream')
	;

	const commandObj = new PublishCommandClass('cli');
	publish?.action?.(commandObj?.execute?.bind?.(commandObj));

	// Add it to the mix
	commanderProcess?.addCommand?.(publish);
	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	const commandObj = new PublishCommandClass('api');
	return {
		'name': 'publish',
		'method': commandObj.execute.bind(commandObj)
	};
};

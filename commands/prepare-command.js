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
 * @class		PrepareCommandClass
 * @classdesc	The command class that handles all the prepare operations.
 *
 * @param		{object} configuration - The configuration object containing the command options from the config file (.announcerc, package.json, etc.)
 *
 * @description
 * The command class that implements the "prepare" step of the workflow.
 * Please see README.md for the details of what this step involves.
 *
 */
class PrepareCommandClass {
	// #region Constructor
	constructor(execMode) {
		this.#execMode = execMode;
	}
	// #endregion

	// #region Public Methods
	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof PrepareCommandClass
	 * @name     execute
	 *
	 * @param    {object} options - Parsed command-line options, or options passed in via API
	 *
	 * @return {null} Nothing.
	 *
	 * @summary  The main method to prepare the codebase for the next release.
	 *
	 * This method does 2 things:
	 * - Generates the next version string based on the current one, the option passed in, and the pre-defined version ladder
	 * - Parses the source files for the current version string, and replaces it with the next one
	 *
	 */
	async execute(options) {
		// Step 1: Setup sane defaults for the options
		const mergedOptions = this._mergeOptions(options);
		// console.log(`Merged Options: ${JSON.stringify(mergedOptions, null, '\t')}`);

		// Step 2: Set up the logger according to the options passed in
		const logger = this._setupLogger(mergedOptions);
		mergedOptions.logger = logger;

		// Step 3: Setup the task list
		const taskList = this?._setupTasks?.();

		// Step 4: Run the tasks in sequence
		// eslint-disable-next-line security-node/detect-crlf
		console.log(`Bumping codebase version for the next development cycle:`);
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
	 * @memberof	PrepareCommandClass
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

		mergedOptions.currentWorkingDirectory = mergedOptions?.currentWorkingDirectory ?? process?.cwd?.();
		mergedOptions.series = mergedOptions?.series ?? 'current';
		mergedOptions.versionLadder = mergedOptions?.versionLadder?.split?.(',')?.map?.((stage) => { return stage?.trim?.(); })?.filter?.((stage) => { return !!stage && stage?.length; });
		mergedOptions.ignoreFolders = mergedOptions?.ignoreFolders?.split?.(',')?.map?.((folder) => { return folder?.trim?.(); })?.filter?.((folder) => { return !!folder && folder?.length; });

		return mergedOptions;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
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
	 * @memberof	PrepareCommandClass
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
			'title': 'Reading current version...',
			'task': this?._getCurrentVersion?.bind?.(this)
		}, {
			'title': 'Computing next version...',
			'task': this?._computeNextVersion?.bind?.(this)
		}, {
			'title': 'Scanning files to be modified...',
			'task': this?._getTargetFileList?.bind?.(this)
		}, {
			'title': 'Bump version...',
			'task': this?._bumpVersion?.bind?.(this),
			'skip': (ctxt) => {
				if(ctxt?.options?.targetFiles?.length)
					return false;

				return 'No files found for modification';
			}
		}], {
			'collapse': false
		});

		return taskList;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_getCurrentVersion
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Returns the version contained in the package.json file.
	 *
	 */
	_getCurrentVersion(ctxt, task) {
		ctxt?.options?.logger?.info?.(task.title);

		const path = require('path');
		const semver = require('semver');

		const projectPackageJson = path.join(ctxt?.options?.currentWorkingDirectory, 'package.json');
		const { version } = require(projectPackageJson);

		if(!version) {
			ctxt?.options?.logger?.error?.(`${projectPackageJson} doesn't contain a version field.`);
			throw new Error(`${projectPackageJson} doesn't contain a version field.`);
		}

		if(!semver.valid(version)) {
			ctxt?.options?.logger?.error?.(`${projectPackageJson} contains a non-semantic-version format: ${version}.`);
			throw new Error(`${projectPackageJson} contains a non-semantic-version format: ${version}`);
		}

		ctxt?.options?.logger?.info(`Current version is: ${version}`);
		task.title = `Current version is: ${version}`;

		ctxt.options.currentVersion = version;
	}

	/**
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_computeNextVersion
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Computes the next version to be applied based on current version, the series, and the version ladder - and returns the string representation of it.
	 *
	 */
	_computeNextVersion(ctxt, task) {
		ctxt?.options?.logger?.info(task.title);

		const semver = require('semver');
		const parsedVersion = semver?.parse?.(ctxt?.options?.currentVersion);

		const incArgs = [ctxt?.options?.currentVersion];
		switch (ctxt?.options?.series) {
			case 'current':
				if(parsedVersion?.prerelease?.length) {
					incArgs?.push?.('prerelease');
					incArgs?.push?.(parsedVersion?.prerelease[0]);
				}
				else {
					incArgs?.push?.('patch');
				}
				break;

			case 'next':
				if(parsedVersion?.prerelease?.length) {
					let preReleaseTag = parsedVersion?.prerelease[0];

					const currentStep = ctxt?.options?.versionLadder?.indexOf?.(preReleaseTag);
					if(currentStep === -1)
						preReleaseTag = 'patch';
					else if(currentStep === ctxt?.options?.versionLadder?.length - 1)
						preReleaseTag = 'patch';
					else
						preReleaseTag = ctxt?.options?.versionLadder?.[currentStep + 1];

					if(preReleaseTag !== 'patch') incArgs?.push?.('prerelease');
					incArgs?.push?.(preReleaseTag);
				}
				else {
					incArgs?.push?.('prerelease');
					incArgs?.push?.(ctxt?.options?.versionLadder?.[0]);
				}
				break;

			case 'patch':
			case 'minor':
			case 'major':
				incArgs?.push?.(ctxt?.options?.series);
				break;

			default:
				throw new Error(`Unknown series: ${ctxt?.options?.series}`);
		}

		const nextVersion = incArgs?.length ? semver?.inc?.(...incArgs) : ctxt?.options?.series;

		ctxt?.options?.logger?.info(`Next version will be: ${nextVersion}`);
		task.title = `Next version will be: ${nextVersion}`;

		ctxt.options.nextVersion = nextVersion;
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_getTargetFileList
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Looks at all the files in the project folder/sub-folders, removes files ignored by .gitignore, then removes files in folders marked ignore in the config, and returns the remaining.
	 *
	 */
	async _getTargetFileList(ctxt, task) {
		try {
			ctxt?.options?.logger?.info?.(task.title);

			const { 'fdir': FDir } = require('fdir');

			const crawler = new FDir()?.withFullPaths?.()?.crawl?.(ctxt?.options?.currentWorkingDirectory);
			const targetFiles = await crawler?.withPromise?.();

			// eslint-disable-next-line node/no-missing-require
			const path = require('path');
			const gitIgnorePath = path.join(ctxt?.options?.currentWorkingDirectory, '.gitignore');

			const fileSystem = require('fs/promises');
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			let gitIgnoreFile = await fileSystem?.readFile?.(gitIgnorePath, { 'encoding': 'utf8' });
			gitIgnoreFile += `\n\n**/.git\n${ctxt?.options?.ignoreFolders?.join?.('\n')}\n\n`;

			gitIgnoreFile = gitIgnoreFile
			?.split?.('\n')
			?.map?.((gitIgnoreLine) => {
				if(gitIgnoreLine?.trim?.()?.length === 0)
					return gitIgnoreLine?.trim?.();

				if(gitIgnoreLine?.startsWith?.('#'))
					return gitIgnoreLine;

				if(gitIgnoreLine?.startsWith?.('**/'))
					return gitIgnoreLine;

				if(gitIgnoreLine?.startsWith?.('/'))
					return `${gitIgnoreLine}\n**${gitIgnoreLine}`;

				return `${gitIgnoreLine}\n${path?.join?.('**', gitIgnoreLine)}`;
			})
			.filter((gitIgnoreLine) => {
				return gitIgnoreLine?.length;
			})
			.join('\n\n');

			const gitIgnoreParser = require('gitignore-parser');
			const gitIgnore = gitIgnoreParser?.compile?.(gitIgnoreFile);

			ctxt.options.targetFiles = targetFiles?.filter?.(gitIgnore?.accepts);

			ctxt?.options?.logger?.info?.(`Files to be modified: ${ctxt?.options?.targetFiles?.length}`);
			task.title = `Files to be modified: ${ctxt?.options?.targetFiles?.length}`;
		}
		catch(err) {
			ctxt?.options?.logger?.error?.(`Problem processing .gitignore: ${err.message}.`);
			task.title = `Scanning files to be modified: Error`;
			throw err;
		}
	}

	/**
	 * @async
	 * @function
	 * @instance
	 * @memberof	PrepareCommandClass
	 * @name		_bumpVersion
	 *
	 * @param		{object} ctxt - Task context containing the options object returned by the _mergeOptions method
	 * @param		{object} task - Reference to the task that is running
	 *
	 * @return		{null} Nothing.
	 *
	 * @summary  	Replaces the old version string with the new version string.
	 *
	 */
	async _bumpVersion(ctxt, task) {
		ctxt?.options?.logger?.info(task.title);

		const replaceInFile = require('replace-in-file');
		const replaceOptions = {
			'files': '',
			'from': '',
			'to': ctxt?.options?.nextVersion
		};

		const changedFiles = [];

		let currentCount = 0;
		let changedCount = 0;

		// eslint-disable-next-line no-useless-escape
		const currentVersion = ctxt?.options?.currentVersion?.replace?.(/\./g, `\.`);
		const targetFiles = ctxt?.options?.targetFiles;
		for(const targetFile of targetFiles) {
			currentCount++;

			task.title = `Processing ${currentCount} / ${targetFiles?.length}, Modified ${changedCount}`;
			replaceOptions.files = targetFile;

			const path = require('path');
			const targetFileBaseName = path.basename(targetFile).trim();
			if(targetFileBaseName.startsWith('package') || targetFileBaseName.startsWith('npm'))
				replaceOptions.from = new RegExp(currentVersion, 'i');
			else
				replaceOptions.from = new RegExp(currentVersion, 'gi');

			const results = await replaceInFile?.(replaceOptions);
			if(!results?.length) continue;

			results.forEach((result) => {
				if(!result?.hasChanged)
					return;

				changedCount++;
				changedFiles?.push?.(result?.file);
			});

			if(this.#execMode === 'cli')
				await this?._sleep?.(250);
		}

		ctxt?.options?.logger?.info?.(`Bumped version in ${changedCount} files: ${changedFiles?.join?.(',')}`);
		task.title = `Bumped version in ${changedCount} files:`;

		if(this.#execMode !== 'cli')
			return;

		setTimeout(() => {
			console.info?.(`      ${changedFiles?.join?.('\n      ')}`);
		}, 500);
	}

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
	const prepare = new Commander.Command('prepare');

	// Setup the command
	prepare?.alias?.('prep');
	prepare
		?.option?.('--current-working-directory <folder>', 'Path to the current working directory', configuration?.prepare?.currentWorkingDirectory?.trim?.() ?? process?.cwd?.())
		?.option?.('--series <type>', 'Specify the series of the next release (current, next, patch, minor, major)', (configuration?.prepare?.series ?? 'current'))
		?.option?.('--version-ladder <stages>', 'Specify the series releases used in the project', (configuration?.prepare?.versionLadder ?? 'dev, alpha, beta, rc, patch, minor, major'))
		?.option?.('--ignore-folders <folder list>', 'Comma-separated list of folders to ignore when checking for files containing the current version string', (configuration?.prepare?.ignoreFolders ?? ''));

	const commandObj = new PrepareCommandClass('cli');
	prepare?.action?.(commandObj?.execute?.bind?.(commandObj));

	// Add it to the mix
	commanderProcess?.addCommand?.(prepare);
	return;
};

// Export the API for usage by downstream programs
exports.apiCreator = function apiCreator() {
	const commandObj = new PrepareCommandClass('api');
	return {
		'name': 'prepare',
		'method': commandObj.execute.bind(commandObj)
	};
};

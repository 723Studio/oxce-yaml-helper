import { workspace, Uri, Disposable, FileSystemWatcher, WorkspaceFolder, Progress, window } from 'vscode';
import { logger } from "./logger";
import { rulesetTree, Translation } from "./rulesetTree";
import { EventEmitter } from "events";
import { rulesetParser } from "./rulesetParser";
import deepmerge = require('deepmerge');

export class RulesetResolver implements Disposable {
    private fileSystemWatcher?: FileSystemWatcher;
    private yamlPattern = '**/*.rul';
    private readonly onDidLoadEmitter: EventEmitter = new EventEmitter();

    public async load(progress: Progress<{ message?: string; increment?: number }>): Promise<void> {
        this.init();
        const start = new Date();

        progress.report({ increment: 0 });

        this.onDidLoadRulesheet(this.ruleSheetLoaded.bind(this, progress));

        await this.loadYamlFiles();
        progress.report({ increment: 100 });
        logger.debug(`yaml files loaded, took ${((new Date()).getTime() - start.getTime()) / 1000}s`);
        this.registerFileWatcher();
        this.onDidLoadEmitter.emit('didLoad');
    }

    public onDidLoad(listener: () => any) {
        this.onDidLoadEmitter.addListener('didLoad', listener);
    }

    public onDidLoadRulesheet(listener: (file: string, files: number, totalFiles: number) => void) {
        this.onDidLoadEmitter.addListener('didLoadRulesheet', listener);
    }

    private init(): void {
        logger.debug('init');

        const pattern = workspace.getConfiguration('oxcYamlHelper').get<string>('ruleFilesPattern');
        if (pattern) {
            this.yamlPattern = pattern;
        }
        logger.debug('using pattern', this.yamlPattern);

        rulesetTree.init();
    }

    private ruleSheetLoaded (progress: Progress<{ message?: string; increment?: number }>, file: string, filesLoaded: number, totalFiles: number): void {
        const increment = Math.round((1 / totalFiles) * 100);

        progress.report({increment: increment, message: `${file} (${filesLoaded}/${totalFiles})`});
    }

    private async loadYamlFiles(): Promise<undefined | void[][]> {
        if (!workspace.workspaceFolders) {
            return;
        }

        return Promise.all(workspace.workspaceFolders.map(async workspaceFolder => {
            logger.debug('loading yaml files for workspace dir:', workspaceFolder.name);
            const files = await this.getYamlFilesForWorkspaceFolder(workspaceFolder);
            return Promise.all(files.map(file => {
                logger.debug('loading ruleset file:', file.path.slice(workspaceFolder.uri.path.length + 1));
                return this.loadYamlIntoTree(file, workspaceFolder, files.length);
            }));
        }));
    }

    private async getYamlFilesForWorkspaceFolder(workspaceFolder: WorkspaceFolder): Promise<Uri[]> {
        let files = await workspace.findFiles(this.yamlPattern, '');
        files = deepmerge(files, await workspace.findFiles('**/Language/*.yml'));

        files = files.filter(file => workspace.getWorkspaceFolder(file)?.uri.path === workspaceFolder.uri.path);
        if (files.length === 0) {
            logger.warn(`no ruleset files in project dir found, ${workspaceFolder.uri.path} is probably not an OXC(E) project.`);
            return files;
        }

        return files;
    }

    private registerFileWatcher(): void {
        if (this.fileSystemWatcher) {
            this.fileSystemWatcher.dispose();
        }
        this.fileSystemWatcher = workspace.createFileSystemWatcher('**/' + this.yamlPattern);
        this.fileSystemWatcher.onDidChange((e: Uri) => {
            logger.debug('reloading ruleset file:', e.path);
            this.loadYamlIntoTree(e);
        });
    }

    private async loadYamlIntoTree(file: Uri, workspaceFolder?: WorkspaceFolder, numberOfFiles?: number): Promise<void> {
        const document = await workspace.openTextDocument(file.path);
        try {
            if (!workspaceFolder) {
                workspaceFolder = workspace.getWorkspaceFolder(file);
            }
            if (!workspaceFolder) {
                throw new Error('workspace folder could not be found');
            }

            const doc = rulesetParser.parseDocument(document.getText());
            const docObject = doc.regular.toJSON();

            const workspaceFile = file.path.slice(workspaceFolder.uri.path.length + 1);
            const isLanguageFile = file.path.indexOf('Language/') !== -1 && file.path.slice(file.path.lastIndexOf('.')) === '.yml';

            let translations: Translation[] = [];
            if (isLanguageFile) {
                translations = rulesetParser.getTranslationsFromLanguageFile(docObject);
            } else {
                const definitions = rulesetParser.getDefinitions(doc.parsed);
                logger.debug(`found ${definitions.length} definitions in file ${workspaceFile}`);

                const variables = rulesetParser.getVariables(docObject);
                translations = rulesetParser.getTranslations(docObject);

                rulesetTree.mergeIntoTree(definitions, workspaceFolder, file);
                rulesetTree.mergeVariablesIntoTree(variables, workspaceFolder, file);
            }

            rulesetTree.mergeTranslationsIntoTree(translations, workspaceFolder, file);

            this.onDidLoadEmitter.emit('didLoadRulesheet', workspaceFile, rulesetTree.getNumberOfParsedDefinitionFiles(workspaceFolder), numberOfFiles);
        } catch (error) {
            logger.error('loadYamlIntoTree', file.path, error.message);
        }
    }

    public getTranslationForKey(key: string, sourceUri?: Uri): string | undefined {
        if (!sourceUri) {
            sourceUri = window.activeTextEditor?.document.uri;
        }
        if (!sourceUri) {
            return;
        }

        const folder = workspace.getWorkspaceFolder(sourceUri);
        if (!folder) {
            return;
        }

        return rulesetTree.getTranslation(key, folder);
    }

    public dispose() {
        if (this.fileSystemWatcher) {
            this.fileSystemWatcher.dispose();
        }
    }
}
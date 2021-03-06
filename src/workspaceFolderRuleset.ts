import { Uri, workspace, WorkspaceFolder } from "vscode";
import { RuleType, Definition, DefinitionLookup, Variables, Translation, Translations } from "./rulesetTree";
import * as deepmerge from 'deepmerge';
import { logger } from "./logger";
import { typedProperties } from "./typedProperties";

export type RulesetFile = { file: Uri, definitions: Definition[] }
export type VariableFile = { file: Uri, variables: Variables }
export type TranslationFile = { file: Uri, translations: Translations }

type TypeLookup = {
    [key: string]: DefinitionLookup[];
};

export class WorkspaceFolderRuleset {
    public definitionsLookup: {[key: string]: DefinitionLookup[]} = {};
    public rulesetFiles: RulesetFile[] = [];
    public variableFiles: VariableFile[] = [];
    public translationFiles: TranslationFile[] = [];
    private variables: Variables = {};
    private translations: Translations = {};

    constructor(public workspaceFolder: WorkspaceFolder) {
    }

    public mergeIntoRulesetTree(definitions: Definition[], sourceFile: Uri) {
        this.addRulesetFile(definitions, sourceFile || null);
        this.definitionsLookup = {};

        this.rulesetFiles.forEach((ruleset) => {
            this.definitionsLookup = deepmerge(
                this.definitionsLookup,
                this.getLookups(ruleset.definitions, ruleset.file)
            );
        });

        logger.debug('Number of type names', Object.keys(this.definitionsLookup).length);
    }

    public mergeVariablesIntoRulesetTree(variables: Variables, sourceFile: Uri) {
        this.addRulesetVariableFile(variables, sourceFile || null);
        this.variables = {};

        this.variableFiles.forEach((file) => {
            this.variables = deepmerge(
                this.variables,
                file.variables
            );
        });

//        logger.debug('Number of variables', Object.keys(this.variables).length);
    }

    public mergeTranslationsIntoTree(translations: Translation[], sourceFile: Uri) {
        const lookups = this.getTranslationLookups(translations);

        this.addRulesetTranslationFile(lookups, sourceFile || null);
        this.translations = {};

        this.translationFiles.forEach((file) => {
            this.translations = deepmerge(
                this.translations,
                file.translations
            );
        });

        // logger.debug(`Number of translations for ${this.getLocale()}: ${Object.keys(this.translations[locale]).length}`);
    }

    private getTranslationLookups(translations: Translation[]): Translations {
        const grouped: Translations = {};

        for (const translation of translations) {
            if (!(translation.language in grouped)) {
                grouped[translation.language] = {};
            }

            grouped[translation.language][translation.key] = translation.value;
        }

        return grouped;
    }



    private getLookups(definitions: Definition[], sourceFile: Uri): TypeLookup {
        const lookups: TypeLookup = {};

        for (const definition of definitions) {
            if (!(definition.name in lookups)) {
                lookups[definition.name] = [];
            }

            lookups[definition.name].push(this.getDefinitionLookup(definition, sourceFile));
        }

        return lookups;
    }

    private getDefinitionLookup(definition: Definition, sourceFile: Uri): DefinitionLookup {
        return {
            type: definition.type,
            range: definition.range,
            file: sourceFile
        };
    }

    /**
     * Get definitions by their type name
     * @param key
     * @param sourceRuleType
     */
    public getDefinitionsByName(key: string, sourceRuleType: RuleType | undefined): DefinitionLookup[] {
        const override = typedProperties.checkForLogicOverrides(key, sourceRuleType);
        const finalKey = override.key;

        if (finalKey in this.definitionsLookup) {
            const lookups = this.definitionsLookup[finalKey].filter(lookup => {
                if (override.target) {
                    return override.target === lookup.type;
                } else {
                    return typedProperties.isTargetForSourceRule(sourceRuleType, lookup.type);
                }
            });

            return lookups;
        }

        return [];
    }

    private addRulesetFile(definitions: Definition[], sourceFile: Uri) {
        const rulesetFile = { definitions, file: sourceFile };
        if (this.rulesetFiles.length > 0 && rulesetFile.file) {
            this.rulesetFiles = this.rulesetFiles.filter(tp => tp.file && tp.file.path !== rulesetFile.file.path);
        }
        this.rulesetFiles.push(rulesetFile);
    }

    private addRulesetVariableFile(variables: Variables, sourceFile: Uri) {
        const variableFile = { variables, file: sourceFile };
        if (this.variableFiles.length > 0 && variableFile.file) {
            this.variableFiles = this.variableFiles.filter(tp => tp.file && tp.file.path !== variableFile.file.path);
        }
        this.variableFiles.push(variableFile);
    }

    private addRulesetTranslationFile(translations: Translations, sourceFile: Uri) {
        const translationFile = { translations, file: sourceFile };
        if (this.translationFiles.length > 0 && translationFile.file) {
            this.translationFiles = this.translationFiles.filter(tp => tp.file && tp.file.path !== translationFile.file.path);
        }
        this.translationFiles.push(translationFile);
    }

    public getVariables(): Variables {
        return this.variables;
    }

    public getNumberOfParsedDefinitionFiles(): number {
        return this.rulesetFiles.length;
    }

    public getTranslation(key: string): string {
        const locale = this.getLocale();

        if (!(locale in this.translations) || !(key in this.translations[locale])) {
            return `No translation found for locale '${locale}' '${key}'!`;
        }

        return this.translations[locale][key];
    }

    private getLocale (): string {
        return workspace.getConfiguration('oxcYamlHelper').get<string>('translationLocale') ?? 'en-US';
    }
}
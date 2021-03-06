import { logger } from "./logger";
import { RuleType } from "./rulesetTree";
import { Pair, Scalar, YAMLSeq } from "yaml/types";
import { rulesetParser, YAMLDocument, YAMLDocumentItem } from "./rulesetParser";
import { typedProperties } from "./typedProperties";

type RecursiveMatch = {
    match: boolean,
    type?: string,
    path?: string,
    node?: Pair | Scalar
    metadata?: Record<string, unknown>
}

type Entry = YAMLSeq | string | Scalar;

export class RulesetRecursiveKeyRetriever {
    public getKeyInformationFromYAML(yaml: string, key: string, range: number[]): RuleType | undefined {
        const match = this.findKeyInformationInYamlDocument(rulesetParser.parseDocument(yaml).parsed, key, range);

        if (!match || !match.type || !match.path) {
            return;
        }

        const ruleMatch: RuleType = {
            type: match.type,
            key: match.path
        };

        if (match.metadata) {
            ruleMatch.metadata = match.metadata;
        }

        return ruleMatch;
    }

    private findKeyInformationInYamlDocument(yamlDocument: YAMLDocument, absoluteKey: string, range: number[]): RecursiveMatch | undefined {
        logger.debug('findKeyInformationInYamlDocument', { absoluteKey });

        const yamlPairs = yamlDocument.contents.items;
        if (!yamlPairs) {
            logger.warn('yamlDocument does not have any items');
            return;
        }

        // loop through each entry in this document
        return this.findRecursiveMatch(yamlPairs, absoluteKey, range) || undefined;
    }

    private findRecursiveMatch(yamlPairs: YAMLDocumentItem[], absoluteKey: string, range: number[]) {
        let match: RecursiveMatch | undefined;

        yamlPairs.forEach((ruleType) => {
            ruleType.value.items.forEach((ruleProperties: YAMLSeq) => {
                const recursiveMatch = this.processItems(ruleProperties, ruleType.key.value, absoluteKey, range);

                match = this.checkForMatch(recursiveMatch, match);
            });
        });

        return match;
    }

    private checkForMatch(recursiveMatch: RecursiveMatch, matchedObject: RecursiveMatch | undefined) {
        if (recursiveMatch.match) {
            if (recursiveMatch.path && recursiveMatch.path.indexOf('.') !== -1) {
                recursiveMatch.type = recursiveMatch.path.slice(0, recursiveMatch.path.indexOf('.'));
                recursiveMatch.path = recursiveMatch.path.slice(recursiveMatch.path.indexOf('.') + 1);
            }

            matchedObject = recursiveMatch;
        }

        return matchedObject;
    }

    private processItems(entry: Entry, path: string, key: string, range: number[]): RecursiveMatch {
        let retval: RecursiveMatch = {
            match: false
        };

        // logger.debug(`now processing ${path} for ${key}:${typeof key}`);

        if (entry === null) {
            // this should actually not happen, but happens if there are parse errors in yaml (like missing values)
            logger.error(`found a null value at ${path} while looking for ${key} -- ignoring`);
           return retval;
        } else if (typeof entry === 'string' || typeof entry === 'number') {
            // logger.debug(`now processing ${path} for ${key}:${typeof key}, ${entry}:${typeof entry}`);
            if (entry === key || entry?.toString() === key/* || (typeof entry === 'number' && parseInt(key) === entry) */) {
                // logger.debug('Possible match found', entry);
                return {
                    match: true
                } as RecursiveMatch;
            }
        } else if ('items' in entry) {
            retval = this.loopEntry(entry, path, key, range, retval);
        } else {
            entry = entry as Scalar;

            // logger.debug(`now processing ${path} for ${key}:${typeof key}, ${entry.value}:${typeof entry.value}`);
            if ((entry.value === key || entry.value?.toString() === key) && this.checkForRangeMatch(entry, range)) {
                retval.match = true;
                retval.node = entry;
                retval.path = path;

                logger.debug('Definitive match found by range (scalar)', key, retval.path, entry);

                return retval;
            }
        }

        return retval;
    }

    private loopEntry(entry: YAMLSeq, path: string, key: string, range: number[], retval: RecursiveMatch) {
        entry.items.forEach((ruleProperty) => {
            if ('items' in ruleProperty) {
                retval = this.loopEntry(ruleProperty, path + '[]', key, range, retval);
            } else {
                const result = this.processItems(ruleProperty.value, path + '.' + ruleProperty?.key?.value, key, range);
                if (result.node) {
                    // node already set, pass it upwards
                    this.addMetadata(result, path, entry);
                    retval = result;
                } else if (result.match && this.checkForRangeMatch(ruleProperty, range)) {
                    logger.debug('Definitive match found by range (string)', key, path, entry);
                    result.node = ruleProperty;
                    result.path = path;

                    retval = result;
                }
            }
        });
        return retval;
    }

    private addMetadata(result: RecursiveMatch, path: string, entry: YAMLSeq) {
        if (result.metadata) {
            return;
        }

        const fields = typedProperties.getMetadataFieldsForType(path);
        if (!fields) {
            return;
        }

        const properties = entry.toJSON() as {[key: string]: any};
        const metadata: Record<string, unknown> = {};
        for (const field of fields) {
            if (properties && field in properties) {
                metadata[field] = properties[field];
            }
        }

        if (Object.keys(metadata).length > 0) {
            result.metadata = metadata;
        }
    }

    private checkForRangeMatch(entry: Scalar | Pair, range: number[]): boolean {
        if (entry.range) {
            if (entry.range[0] === range[0] && entry.range[1] === range[1]) {
                return true;
            }
        }

        return false;
    }
}

export const rulesetRecursiveKeyRetriever = new RulesetRecursiveKeyRetriever();

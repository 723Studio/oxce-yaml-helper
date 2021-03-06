import { logger } from "./logger";
import { YAMLMap } from "yaml/types";
import { typedProperties } from "./typedProperties";
import { JsonObject, YAMLDocument, YAMLDocumentItem } from "./rulesetParser";
import { Definition } from "./rulesetTree";

export class RulesetDefinitionFinder {
    public findAllDefinitionsInYamlDocument(yamlDocument: YAMLDocument): Definition[] {
        // logger.debug('findAllDefinitionsInYamlDocument');

        const yamlPairs = yamlDocument.contents.items;
        if (!yamlPairs) {
            logger.warn('yamlDocument does not have any items');
            return [];
        }

        const definitions: Definition[] = [];

        // loop through each type in this document
        for (const ruleType of yamlPairs) {
            // console.log('ruleType', ruleType.key.value);
            ruleType.value.items?.forEach((ruleProperties: YAMLMap) => {
                // console.log('ruleprop', ruleProperties);

                const propertiesFlat = ruleProperties.toJSON() as {[key: string]: string | Record<string, unknown>};
                const typeKey = typedProperties.getTypeKey(propertiesFlat, ruleType.key.value);
                if (['extraSprites', 'extraSounds'].indexOf(ruleType.key.value) !== -1) {
                    this.handleExtraFiles(propertiesFlat, ruleProperties, definitions, ruleType);
                }

                if (typeKey && typeKey in propertiesFlat) {
                    // now get the range
                    for (const ruleProperty of ruleProperties.items) {
                        if (ruleProperty.key.value === typeKey) {
                            definitions.push({
                                type: ruleType.key.value,
                                // field: typeKey,
                                name: propertiesFlat[typeKey] as string,
                                range: ruleProperty.value.range,
                            });

                            break;
                        }
                    }
                }
            });
        }

        return definitions;
    }

    /**
     * Parses extraSprites and extraSounds
     * @param propertiesFlat
     * @param ruleProperties
     * @param definitions
     * @param ruleType
     */
    private handleExtraFiles(propertiesFlat: JsonObject, ruleProperties: YAMLMap, definitions: Definition[], ruleType: YAMLDocumentItem) {
        const typeKey = 'files';
        if (!(typeKey in propertiesFlat)) {
            return;
        }

        for (const ruleProperty of ruleProperties.items) {
            if (ruleProperty.key.value === typeKey) {
                for (const entry of ruleProperty.value.items) {
                    definitions.push({
                        type: ruleType.key.value + '.' + propertiesFlat.type + '.' + typeKey,
                        // field: typeKey,
                        name: entry.key.value,
                        range: entry.key.range,
                    });
                }
            }
        }
    }
}

export const rulesetDefinitionFinder = new RulesetDefinitionFinder();

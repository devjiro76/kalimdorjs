import * as _ from 'lodash';
import * as Handlebars from 'handlebars';
import { APIProcessor } from './APIProcessor';
import { PagesProcessor } from './PagesProcessor';
import { ConfigProcessor } from './ConfigProcessor';
const docsJson = require('../docs.json');
const pjson = require('../../package.json');

// File's Class|Method kind
const kindStringConst = 'Constructor';
const kindStringMethod = 'Method';

// Parameter type
const paramTypeReflection = 'reflection';
const paramTypeIntrinsic = 'intrinsic';
const paramTypeArray = 'array';
const paramTypeReference = 'reference';

// Return type
const returnTypeIntrinsic = 'intrinsic';
const returnTypeArray = 'array';

export class HandlebarHelpers {
  /**
   * check equality of x and y.
   * If they are equal, returns true(context e.g. children) || false(context e.g. children)
   * @param children
   * @param x
   * @param y
   * @param options
   * @returns {any}
   */
  static ifEquals(children, x, y, options) {
    return _.isEqual(x, y) ? options.fn(children) : options.inverse(children);
  }
  /**
   * Filters a children by a kind name such as Constructor or Method
   * @param children
   * @param options
   * @param kind
   * @returns {any}
   */
  static filterByKind(children, options, kind) {
    if (children) {
      const filtered = children.filter(child => {
        return child.kindString === kind;
      });
      return _.isEmpty(filtered) ? options.inverse(this) : options.fn(filtered);
    } else {
      return options.inverse(children);
    }
  }

  /**
   * Search tree to find an entity with the ID
   * @param docs
   * @param id
   * @returns {any}
   */
  static searchInterface(docs, id) {
    let candidate = null;
    _.forEach(docs.children, module => {
      _.forEach(module.children, entity => {
        if (entity.id === id) {
          candidate = entity;
        }
      });
    });
    return candidate;
  }

  /**
   * Check if a signatures collection is empty
   * 1. If signature itself is empty or undefined
   * 2. If the first signature does not contain "parameters"
   * @param context - current context, typically this
   * @param options
   */
  static isSignatureValid(context, options) {
    const signatures = context.signatures;
    if (_.isEmpty(signatures) || !signatures) {
      return options.inverse(context);
    }

    const firstSignature = _.first(signatures);
    const firstSignatureParams = _.get(firstSignature, 'parameters');
    if (_.isEmpty(firstSignatureParams) || !firstSignatureParams) {
      return options.inverse(context);
    }

    // Otherwise returns true
    return options.fn(context);
  }

  static constructParamTable(parameters) {
    // Param table characters blacklist
    const paramTableCharsBlackList = ['\n', '_'];

    /**
     * Prioritise getting text instead of shortText description
     * @param param
     */
    const getText = param => {
      const text = _.get(param, 'comment.text');
      const shortText = _.get(param, 'comment.shortText');
      if (text) {
        return text;
      } else if (shortText) {
        return shortText;
      }
      return undefined;
    };
    const cleanTableText = text => {
      const blacklistCleaned = _.reduce(
        paramTableCharsBlackList,
        (result, rmChar) => {
          return _.replace(result, rmChar, '');
        },
        text
      );
      return _.trim(blacklistCleaned);
    };

    // Going through the method level params
    // e.g. test(a: {}, b: number, c: string)
    // a -> b -> c
    const consolidatedParams = _.reduce(
      parameters,
      (sum, param) => {
        const paramType = param.type.type;
        if (paramTypeReflection === paramType) {
          // 1. Handle reflection/named param
          // e.g. x: { test1, test2 }
          _.forEach(param.type.declaration.children, namedParam => {
            sum.push([
              `${param.name}.${namedParam.name}`,
              namedParam.type.name,
              namedParam.defaultValue,
              getText(namedParam)
            ]);
          });
        } else if (paramTypeIntrinsic === paramType) {
          //  2. Handle any intrintic params
          // e.g. x: number
          sum.push([param.name, param.type.name, param.defaultValue, getText(param)]);
        } else if (paramTypeArray === paramType) {
          // 3. Handle any array params
          // e.g. string[]
          sum.push([param.name, param.type.name, param.defaultValue, getText(param)]);
        } else if (paramTypeReference === paramType) {
          // 4. Handle any Interface params
          // e.g. x: Options
          const foundRef = this.searchInterface(docsJson, param.type.id);
          _.forEach(foundRef.children, prop => {
            sum.push([`${param.name}.${prop.name}`, prop.type.name, prop.defaultValue, getText(prop)]);
          });
        }
        return sum;
      },
      []
    );
    // flatten any [ [ [] ] ] 3rd layer arrays
    const tableHeader = '| Param | Type | Default | Description |\n';
    const tableSplit = '| ------ | ------ | ------ | ------ |\n';
    let stringBuilder = `${tableHeader}${tableSplit}`;
    // TODO: Is there a better way of building a string??.. should we do it from the template?
    for (let i = 0; i < _.size(consolidatedParams); i++) {
      const [name, type, defaultValue, description] = consolidatedParams[i];
      const cleanName = cleanTableText(name);
      const cleanType = cleanTableText(type);
      const cleanDefaultValue = cleanTableText(defaultValue);
      const cleanDescription = cleanTableText(description);
      stringBuilder += `| ${cleanName} | ${cleanType} | ${cleanDefaultValue} | ${cleanDescription}\n`;
    }
    return stringBuilder;
  }

  /**
   * Renders method return type
   * @param type
   * @returns {string}
   */
  static renderMethodReturnType(type) {
    if (type.type === returnTypeIntrinsic) {
      return type.name;
    } else if (type.type === returnTypeArray) {
      return `${type.elementType.name}[]`;
    }
  }

  /**
   * Gets method () block next to the method name
   * e.g. (props: any, x: string)
   * @param parameters
   * @returns {string}
   */
  static renderMethodBracket(parameters) {
    const params = _.map(parameters, param => {
      const paramType = _.isString(param.type) ? param.type : 'object';
      return `${param.name}: *\`${paramType}\`*`;
    });
    return `(${params.join(',')})`;
  }

  /**
   * Get a source link such as
   * [ensemble/forest.ts:6](https://github.com/JasonShin/kalimdorjs/blob/master/src/lib/ensemble/forest.ts#L6)
   * @param sources
   * @returns {string}
   */
  static renderSourceLink(sources) {
    const defined = _.map(sources, src => {
      return `[${src.fileName}:${src.line}](${pjson.repository}/blob/master/src/lib/${src.fileName}#L${src.line})`;
    });
    return defined.join(',');
  }

  /**
   * Renders a new line
   * @returns {string}
   */
  static renderNewLine() {
    return '\n';
  }
}

Handlebars.registerHelper('ifEquals', (children, x, y, options) => HandlebarHelpers.ifEquals(children, x, y, options));

Handlebars.registerHelper('isSignatureValid', (context, options) =>
  HandlebarHelpers.isSignatureValid(context, options)
);

Handlebars.registerHelper('filterConstructor', (children, options) =>
  HandlebarHelpers.filterByKind(children, options, kindStringConst)
);

Handlebars.registerHelper('filterMethod', (children, options) =>
  HandlebarHelpers.filterByKind(children, options, kindStringMethod)
);

Handlebars.registerHelper('constructParamTable', parameters => HandlebarHelpers.constructParamTable(parameters));

Handlebars.registerHelper('renderMethodReturnType', type => HandlebarHelpers.renderMethodReturnType(type));

Handlebars.registerHelper('methodBracket', parameters => HandlebarHelpers.renderMethodBracket(parameters));

Handlebars.registerHelper('getSourceLink', sources => HandlebarHelpers.renderSourceLink(sources));

Handlebars.registerHelper('newLine', HandlebarHelpers.renderNewLine);

// Processors
const apiProcessor = new APIProcessor();
apiProcessor.run(Handlebars);

const pagesProcessor = new PagesProcessor({ defaultREADME: true });
pagesProcessor.run();

const configProcessor = new ConfigProcessor();
configProcessor.run({ apiChildren: apiProcessor.apiChildren });
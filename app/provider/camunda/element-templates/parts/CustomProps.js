'use strict';

var assign = require('lodash/assign');

var entryFactory = require('bpmn-js-properties-panel/lib/factory/EntryFactory'),
    getBusinessObject = require('bpmn-js/lib/util/ModelUtil').getBusinessObject,
    cmdHelper = require('bpmn-js-properties-panel/lib/helper/CmdHelper'),
    elementHelper = require('bpmn-js-properties-panel/lib/helper/ElementHelper');

var findExtension = require('../Helper').findExtension,
    findExtensions = require('../Helper').findExtensions,
    findInputParameter = require('../Helper').findInputParameter,
    findOutputParameter = require('../Helper').findOutputParameter,
    findActivitiProperty = require('../Helper').findActivitiProperty,
    findActivitiInOut = require('../Helper').findActivitiInOut,
    findActivitiErrorEventDefinition = require('../Helper').findActivitiErrorEventDefinition;

var createActivitiProperty = require('../CreateHelper').createActivitiProperty,
    createInputParameter = require('../CreateHelper').createInputParameter,
    createOutputParameter = require('../CreateHelper').createOutputParameter,
    createActivitiIn = require('../CreateHelper').createActivitiIn,
    createActivitiOut = require('../CreateHelper').createActivitiOut,
    createActivitiInWithBusinessKey = require('../CreateHelper').createActivitiInWithBusinessKey,
    createActivitiFieldInjection = require('../CreateHelper').createActivitiFieldInjection,
    createActivitiErrorEventDefinition = require('../CreateHelper').createActivitiErrorEventDefinition,
    createError = require('../CreateHelper').createError;

var handleLegacyScopes = require('../util/handleLegacyScopes');

var getRoot = require('bpmn-js-properties-panel/lib/Utils').getRoot;

var PROPERTY_TYPE = 'property',
    Activiti_PROPERTY_TYPE = 'Activiti:property',
    Activiti_INPUT_PARAMETER_TYPE = 'Activiti:inputParameter',
    Activiti_OUTPUT_PARAMETER_TYPE = 'Activiti:outputParameter',
    Activiti_IN_TYPE = 'Activiti:in',
    Activiti_OUT_TYPE = 'Activiti:out',
    Activiti_IN_BUSINESS_KEY_TYPE = 'Activiti:in:businessKey',
    Activiti_EXECUTION_LISTENER_TYPE = 'Activiti:executionListener',
    Activiti_FIELD = 'Activiti:field',
    Activiti_ERROR_EVENT_DEFINITION = 'Activiti:errorEventDefinition';

var BASIC_MODDLE_TYPES = [
  'Boolean',
  'Integer',
  'String'
];

var EXTENSION_BINDING_TYPES = [
  Activiti_PROPERTY_TYPE,
  Activiti_INPUT_PARAMETER_TYPE,
  Activiti_OUTPUT_PARAMETER_TYPE,
  Activiti_IN_TYPE,
  Activiti_OUT_TYPE,
  Activiti_IN_BUSINESS_KEY_TYPE,
  Activiti_FIELD,
  Activiti_ERROR_EVENT_DEFINITION
];

var IO_BINDING_TYPES = [
  Activiti_INPUT_PARAMETER_TYPE,
  Activiti_OUTPUT_PARAMETER_TYPE
];

var IN_OUT_BINDING_TYPES = [
  Activiti_IN_TYPE,
  Activiti_OUT_TYPE,
  Activiti_IN_BUSINESS_KEY_TYPE
];

/**
 * Injects custom properties into the given group.
 *
 * @param {djs.model.Base} element
 * @param {ElementTemplates} elementTemplates
 * @param {BpmnFactory} bpmnFactory
 * @param {Function} translate
 */
module.exports = function(element, elementTemplates, bpmnFactory, translate) {

  var template = elementTemplates.get(element);

  if (!template) {
    return [];
  }

  var renderCustomField = function(id, p, idx) {
    var propertyType = p.type;

    var entryOptions = {
      id: id,
      description: p.description,
      label: p.label ? translate(p.label) : p.label,
      modelProperty: id,
      get: propertyGetter(id, p),
      set: propertySetter(id, p, bpmnFactory),
      validate: propertyValidator(id, p, translate)
    };

    var entry;

    if (!propertyType) {
      propertyType = getDefaultType(p);
    }

    if (propertyType === 'Boolean') {
      entry = entryFactory.checkbox(translate, entryOptions);
    }

    if (propertyType === 'String') {
      entry = entryFactory.textField(translate, entryOptions);
    }

    if (propertyType === 'Text') {
      entry = entryFactory.textBox(translate, entryOptions);
    }

    if (propertyType === 'Dropdown') {
      entryOptions.selectOptions = p.choices;

      entry = entryFactory.selectBox(translate, entryOptions);
    }

    return entry;
  };

  var groups = [];
  var id, entry;

  var customFieldsGroup = {
    id: 'customField',
    label: translate('Custom Fields'),
    entries: []
  };
  template.properties.forEach(function(p, idx) {

    id = 'custom-' + template.id + '-' + idx;

    entry = renderCustomField(id, p, idx);
    if (entry) {
      customFieldsGroup.entries.push(entry);
    }
  });
  if (customFieldsGroup.entries.length > 0) {
    groups.push(customFieldsGroup);
  }

  if (template.scopes) {

    handleLegacyScopes(template.scopes).forEach(function(scope) {

      var scopeType = scope.type;

      var idScopeName = scopeType.replace(/:/g, '_');

      var customScopeFieldsGroup = {
        id: 'customField-' + idScopeName,
        label: translate('Custom Fields for scope: ') + scopeType,
        entries: []
      };

      scope.properties.forEach(function(p, idx) {

        var propertyId = 'custom-' + template.id + '-' + idScopeName + '-' + idx;

        var scopedProperty = propertyWithScope(p, scope);

        entry = renderCustomField(propertyId, scopedProperty, idx);
        if (entry) {
          customScopeFieldsGroup.entries.push(entry);
        }
      });

      if (customScopeFieldsGroup.entries.length > 0) {
        groups.push(customScopeFieldsGroup);
      }
    });
  }

  return groups;
};


// getters, setters and validators ///////////////


/**
 * Return a getter that retrieves the given property.
 *
 * @param {String} name
 * @param {PropertyDescriptor} property
 *
 * @return {Function}
 */
function propertyGetter(name, property) {

  /* getter */
  return function get(element) {
    var value = getPropertyValue(element, property);

    return objectWithKey(name, value);
  };
}

/**
 * Return a setter that updates the given property.
 *
 * @param {String} name
 * @param {PropertyDescriptor} property
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {Function}
 */
function propertySetter(name, property, bpmnFactory) {

  /* setter */
  return function set(element, values) {

    var value = values[name];

    return setPropertyValue(element, property, value, bpmnFactory);
  };
}

/**
 * Return a validator that ensures the property is ok.
 *
 * @param {String} name
 * @param {PropertyDescriptor} property
 * @param {Function} translate
 *
 * @return {Function}
 */
function propertyValidator(name, property, translate) {

  /* validator */
  return function validate(element, values) {
    var value = values[name];

    var error = validateValue(value, property, translate);

    if (error) {
      return objectWithKey(name, error);
    }
  };
}


// get, set and validate helpers ///////////////////

/**
 * Return the value of the specified property descriptor,
 * on the passed diagram element.
 *
 * @param {djs.model.Base} element
 * @param {PropertyDescriptor} property
 *
 * @return {Any}
 */
function getPropertyValue(element, property) {

  var bo = getBusinessObject(element);

  var binding = property.binding,
      scope = property.scope;

  var bindingType = binding.type,
      bindingName = binding.name;

  var propertyValue = property.value || '';

  if (scope) {
    bo = findScopeElement(bo, scope);
    if (!bo) {
      return propertyValue;
    }
  }

  // property
  if (bindingType === 'property') {

    var value = bo.get(bindingName);

    if (bindingName === 'conditionExpression') {
      if (value) {
        return value.body;
      } else {

        // return defined default
        return propertyValue;
      }
    } else {

      // return value; default to defined default
      return typeof value !== 'undefined' ? value : propertyValue;
    }
  }

  var ActivitiProperties,
      ActivitiProperty;

  if (bindingType === Activiti_PROPERTY_TYPE) {
    if (scope) {
      ActivitiProperties = bo.get('properties');
    } else {
      ActivitiProperties = findExtension(bo, 'Activiti:Properties');
    }

    if (ActivitiProperties) {
      ActivitiProperty = findActivitiProperty(ActivitiProperties, binding);

      if (ActivitiProperty) {
        return ActivitiProperty.value;
      }
    }

    return propertyValue;
  }

  var inputOutput,
      ioParameter;

  if (IO_BINDING_TYPES.indexOf(bindingType) !== -1) {

    if (scope) {
      inputOutput = bo.get('inputOutput');
    } else {
      inputOutput = findExtension(bo, 'Activiti:InputOutput');
    }

    if (!inputOutput) {

      // ioParameter cannot exist yet, return property value
      return propertyValue;
    }
  }

  // Activiti input parameter
  if (bindingType === Activiti_INPUT_PARAMETER_TYPE) {
    ioParameter = findInputParameter(inputOutput, binding);

    if (ioParameter) {
      if (binding.scriptFormat) {
        if (ioParameter.definition) {
          return ioParameter.definition.value;
        }
      } else {
        return ioParameter.value || '';
      }
    }

    return propertyValue;
  }

  // Activiti output parameter
  if (binding.type === Activiti_OUTPUT_PARAMETER_TYPE) {
    ioParameter = findOutputParameter(inputOutput, binding);

    if (ioParameter) {
      return ioParameter.name;
    }

    return propertyValue;
  }


  var ioElement;

  if (IN_OUT_BINDING_TYPES.indexOf(bindingType) != -1) {
    ioElement = findActivitiInOut(bo, binding);

    if (ioElement) {
      if (bindingType === Activiti_IN_BUSINESS_KEY_TYPE) {
        return ioElement.businessKey;
      } else
      if (bindingType === Activiti_OUT_TYPE) {
        return ioElement.target;
      } else
      if (bindingType === Activiti_IN_TYPE) {
        return ioElement[binding.expression ? 'sourceExpression' : 'source'];
      }
    }

    return propertyValue;
  }

  if (bindingType === Activiti_EXECUTION_LISTENER_TYPE) {
    var executionListener;
    if (scope) {
      executionListener = bo.get('executionListener');
    } else {
      executionListener = findExtension(bo, 'Activiti:ExecutionListener');
    }

    return executionListener.script.value;
  }

  var fieldInjection;
  if (Activiti_FIELD === bindingType) {
    var fieldInjections = findExtensions(bo, [ 'Activiti:Field' ]);
    fieldInjections.forEach(function(item) {
      if (item.name === binding.name) {
        fieldInjection = item;
      }
    });
    if (fieldInjection) {
      return fieldInjection.string || fieldInjection.expression;
    } else {
      return '';
    }
  }

  var errorEventDefinition;
  if (Activiti_ERROR_EVENT_DEFINITION === bindingType) {
    errorEventDefinition = findActivitiErrorEventDefinition(bo, binding.errorRef);

    if (errorEventDefinition) {
      return errorEventDefinition.expression;
    } else {
      return '';
    }
  }

  throw unknownPropertyBinding(property);
}

module.exports.getPropertyValue = getPropertyValue;


/**
 * Return an update operation that changes the diagram
 * element's custom property to the given value.
 *
 * The response of this method will be processed via
 * {@link PropertiesPanel#applyChanges}.
 *
 * @param {djs.model.Base} element
 * @param {PropertyDescriptor} property
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {Object|Array<Object>} results to be processed
 */
function setPropertyValue(element, property, value, bpmnFactory) {
  var bo = getBusinessObject(element);

  var binding = property.binding,
      scope = property.scope;

  var bindingType = binding.type,
      bindingName = binding.name;

  var rootElement = getRoot(bo);

  var propertyValue;

  var updates = [];

  var extensionElements;

  if (EXTENSION_BINDING_TYPES.indexOf(bindingType) !== -1) {
    extensionElements = bo.get('extensionElements');

    // create extension elements, if they do not exist (yet)
    if (!extensionElements) {
      extensionElements = elementHelper.createElement('bpmn:ExtensionElements', null, element, bpmnFactory);

      updates.push(cmdHelper.updateBusinessObject(
        element, bo, objectWithKey('extensionElements', extensionElements)
      ));
    }
  }

  if (scope) {
    bo = findScopeElement(bo, scope);
    if (!bo) {

      // bpmn:Error
      if (scope.name === 'bpmn:Error') {
        bo = createError(scope.id, rootElement, bpmnFactory);

        updates.push(cmdHelper.addElementsTolist(
          bo, rootElement, 'rootElements', [ bo ]
        ));
      } else {
        bo = elementHelper.createElement(scope.name, null, element, bpmnFactory);

        updates.push(cmdHelper.addElementsTolist(
          bo, extensionElements, 'values', [ bo ]
        ));
      }
    }
  }

  // property
  if (bindingType === 'property') {

    if (bindingName === 'conditionExpression') {

      propertyValue = elementHelper.createElement('bpmn:FormalExpression', {
        body: value,
        language: binding.scriptFormat
      }, bo, bpmnFactory);
    } else {

      var moddlePropertyDescriptor = bo.$descriptor.propertiesByName[bindingName];

      var moddleType = moddlePropertyDescriptor.type;

      // make sure we only update String, Integer, Real and
      // Boolean properties (do not accidentally override complex objects...)
      if (BASIC_MODDLE_TYPES.indexOf(moddleType) === -1) {
        throw new Error('cannot set moddle type <' + moddleType + '>');
      }

      if (moddleType === 'Boolean') {
        propertyValue = !!value;
      } else
      if (moddleType === 'Integer') {
        propertyValue = parseInt(value, 10);

        if (isNaN(propertyValue)) {

          // do not write NaN value
          propertyValue = undefined;
        }
      } else {
        propertyValue = value;
      }
    }

    if (propertyValue !== undefined) {
      updates.push(cmdHelper.updateBusinessObject(
        element, bo, objectWithKey(bindingName, propertyValue)
      ));
    }
  }

  // Activiti:property
  var ActivitiProperties,
      existingActivitiProperty,
      newActivitiProperty;

  if (bindingType === Activiti_PROPERTY_TYPE) {

    if (scope) {
      ActivitiProperties = bo.get('properties');
    } else {
      ActivitiProperties = findExtension(extensionElements, 'Activiti:Properties');
    }

    if (!ActivitiProperties) {
      ActivitiProperties = elementHelper.createElement('Activiti:Properties', null, bo, bpmnFactory);

      if (scope) {
        updates.push(cmdHelper.updateBusinessObject(
          element, bo, { properties: ActivitiProperties }
        ));
      }
      else {
        updates.push(cmdHelper.addElementsTolist(
          element, extensionElements, 'values', [ ActivitiProperties ]
        ));
      }
    }

    existingActivitiProperty = findActivitiProperty(ActivitiProperties, binding);

    newActivitiProperty = createActivitiProperty(binding, value, bpmnFactory);

    updates.push(cmdHelper.addAndRemoveElementsFromList(
      element,
      ActivitiProperties,
      'values',
      null,
      [ newActivitiProperty ],
      existingActivitiProperty ? [ existingActivitiProperty ] : []
    ));
  }

  // Activiti:inputParameter
  // Activiti:outputParameter
  var inputOutput,
      existingIoParameter,
      newIoParameter;

  if (IO_BINDING_TYPES.indexOf(bindingType) !== -1) {

    if (scope) {
      inputOutput = bo.get('inputOutput');
    } else {
      inputOutput = findExtension(extensionElements, 'Activiti:InputOutput');
    }

    // create inputOutput element, if it do not exist (yet)
    if (!inputOutput) {
      inputOutput = elementHelper.createElement('Activiti:InputOutput', null, bo, bpmnFactory);

      if (scope) {
        updates.push(cmdHelper.updateBusinessObject(
          element, bo, { inputOutput: inputOutput }
        ));
      }
      else {
        updates.push(cmdHelper.addElementsTolist(
          element, extensionElements, 'values', inputOutput
        ));
      }
    }
  }

  if (bindingType === Activiti_INPUT_PARAMETER_TYPE) {

    existingIoParameter = findInputParameter(inputOutput, binding);

    newIoParameter = createInputParameter(binding, value, bpmnFactory);

    updates.push(cmdHelper.addAndRemoveElementsFromList(
      element,
      inputOutput,
      'inputParameters',
      null,
      [ newIoParameter ],
      existingIoParameter ? [ existingIoParameter ] : []
    ));
  }

  if (bindingType === Activiti_OUTPUT_PARAMETER_TYPE) {

    existingIoParameter = findOutputParameter(inputOutput, binding);

    newIoParameter = createOutputParameter(binding, value, bpmnFactory);

    updates.push(cmdHelper.addAndRemoveElementsFromList(
      element,
      inputOutput,
      'outputParameters',
      null,
      [ newIoParameter ],
      existingIoParameter ? [ existingIoParameter ] : []
    ));
  }


  // Activiti:in
  // Activiti:out
  // Activiti:in:businessKey
  var existingInOut,
      newInOut;

  if (IN_OUT_BINDING_TYPES.indexOf(bindingType) !== -1) {

    existingInOut = findActivitiInOut(bo, binding);

    if (bindingType === Activiti_IN_TYPE) {
      newInOut = createActivitiIn(binding, value, bpmnFactory);
    } else
    if (bindingType === Activiti_OUT_TYPE) {
      newInOut = createActivitiOut(binding, value, bpmnFactory);
    } else {
      newInOut = createActivitiInWithBusinessKey(binding, value, bpmnFactory);
    }

    updates.push(cmdHelper.addAndRemoveElementsFromList(
      element,
      extensionElements,
      'values',
      null,
      [ newInOut ],
      existingInOut ? [ existingInOut ] : []
    ));
  }

  if (bindingType === Activiti_FIELD) {
    var existingFieldInjections = findExtensions(bo, [ 'Activiti:Field' ]);
    var newFieldInjections = [];

    if (existingFieldInjections.length > 0) {
      existingFieldInjections.forEach(function(item) {
        if (item.name === binding.name) {
          newFieldInjections.push(createActivitiFieldInjection(binding, value, bpmnFactory));
        } else {
          newFieldInjections.push(item);
        }
      });
    } else {
      newFieldInjections.push(createActivitiFieldInjection(binding, value, bpmnFactory));
    }

    updates.push(cmdHelper.addAndRemoveElementsFromList(
      element,
      extensionElements,
      'values',
      null,
      newFieldInjections,
      existingFieldInjections ? existingFieldInjections : []
    ));
  }

  // Activiti:errorEventDefinition
  if (bindingType === Activiti_ERROR_EVENT_DEFINITION) {
    var existingErrorEventDefinition = findActivitiErrorEventDefinition(bo, binding.errorRef);

    if (existingErrorEventDefinition) {
      updates.push(cmdHelper.updateBusinessObject(
        element, existingErrorEventDefinition, { expression: value }
      ));
    } else {

      var newError = createError(binding.errorRef, rootElement, bpmnFactory),
          newEventDefinition =
            createActivitiErrorEventDefinition(binding, value, newError, extensionElements, bpmnFactory);

      updates.push(cmdHelper.addAndRemoveElementsFromList(
        element,
        rootElement,
        'rootElements',
        null,
        [ newError ],
        []
      ));

      updates.push(cmdHelper.addAndRemoveElementsFromList(
        element,
        extensionElements,
        'values',
        null,
        [ newEventDefinition ],
        []
      ));
    }

  }

  if (updates.length) {
    return updates;
  }

  // quick warning for better debugging
  console.warn('no update', element, property, value);
}

module.exports.setPropertyValue = setPropertyValue;

/**
 * Validate value of a given property.
 *
 * @param {String} value
 * @param {PropertyDescriptor} property
 * @param {Function} translate
 *
 * @return {Object} with validation errors
 */
function validateValue(value, property, translate) {

  var constraints = property.constraints || {};

  if (constraints.notEmpty && isEmpty(value)) {
    return translate('Must not be empty');
  }

  if (constraints.maxLength && value.length > constraints.maxLength) {
    return translate('Must have max length {length}', { length: constraints.maxLength });
  }

  if (constraints.minLength && value.length < constraints.minLength) {
    return translate('Must have min length {length}', { length: constraints.minLength });
  }

  var pattern = constraints.pattern,
      message;

  if (pattern) {

    if (typeof pattern !== 'string') {
      message = pattern.message;
      pattern = pattern.value;
    }

    if (!matchesPattern(value, pattern)) {
      return message || translate('Must match pattern {pattern}', { pattern: pattern });
    }
  }
}


// misc helpers ///////////////////////////////

function propertyWithScope(property, scope) {
  var scopeName = scope.type,
      scopeId = scope.id;

  if (!scopeName) {
    return property;
  }

  return assign({}, property, {
    scope: {
      name: scopeName,
      id: scopeId
    }
  });
}

/**
 * Return an object with a single key -> value association.
 *
 * @param {String} key
 * @param {Any} value
 *
 * @return {Object}
 */
function objectWithKey(key, value) {
  var obj = {};

  obj[key] = value;

  return obj;
}

/**
 * Does the given string match the specified pattern?
 *
 * @param {String} str
 * @param {String} pattern
 *
 * @return {Boolean}
 */
function matchesPattern(str, pattern) {
  var regexp = new RegExp(pattern);

  return regexp.test(str);
}

function isEmpty(str) {
  return !str || /^\s*$/.test(str);
}

/**
 * Create a new {@link Error} indicating an unknown
 * property binding.
 *
 * @param {PropertyDescriptor} property
 *
 * @return {Error}
 */
function unknownPropertyBinding(property) {
  var binding = property.binding;

  return new Error('unknown binding: <' + binding.type + '>');
}

function getDefaultType(property) {
  var binding = property.binding,
      bindingType = binding.type;

  if (bindingType === PROPERTY_TYPE ||
      bindingType === Activiti_PROPERTY_TYPE ||
      bindingType === Activiti_IN_TYPE ||
      bindingType === Activiti_IN_BUSINESS_KEY_TYPE ||
      bindingType === Activiti_OUT_TYPE ||
      bindingType === Activiti_FIELD) {
    return 'String';
  }

  if (bindingType === Activiti_EXECUTION_LISTENER_TYPE) {
    return 'Hidden';
  }
}

function findScopeElement(businessObject, scope) {

  var scopeName = scope.name,
      scopeId = scope.id;

  if (scopeName === 'bpmn:Error') {

    // retrieve error over referenced error event definition
    var errorEventDefinition = findActivitiErrorEventDefinition(businessObject, scopeId);

    if (errorEventDefinition) {
      return errorEventDefinition.errorRef;
    }
  }

  return findExtension(businessObject, scopeName);
}
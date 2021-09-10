'use strict';

var assign = require('lodash/assign');

var nextId = require('bpmn-js-properties-panel/lib/Utils').nextId;

/**
 * Create an input parameter representing the given
 * binding and value.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createInputParameter(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: value
    });
  } else {
    parameterValue = value;
  }

  return bpmnFactory.create('activiti:InputParameter', {
    name: binding.name,
    value: parameterValue,
    definition: parameterDefinition
  });
}

module.exports.createInputParameter = createInputParameter;


/**
 * Create an output parameter representing the given
 * binding and value.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createOutputParameter(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: binding.source
    });
  } else {
    parameterValue = binding.source;
  }

  return bpmnFactory.create('activiti:OutputParameter', {
    name: value,
    value: parameterValue,
    definition: parameterDefinition
  });
}

module.exports.createOutputParameter = createOutputParameter;


/**
 * Create activiti property from the given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiProperty(binding, value, bpmnFactory) {
  return bpmnFactory.create('activiti:Property', {
    name: binding.name,
    value: value || ''
  });
}

module.exports.createactivitiProperty = createactivitiProperty;


/**
 * Create activiti:in element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiIn(binding, value, bpmnFactory) {

  var properties = createactivitiInOutAttrs(binding, value);

  return bpmnFactory.create('activiti:In', properties);
}

module.exports.createactivitiIn = createactivitiIn;


/**
 * Create activiti:in with businessKey element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiInWithBusinessKey(binding, value, bpmnFactory) {
  return bpmnFactory.create('activiti:In', {
    businessKey: value
  });
}

module.exports.createactivitiInWithBusinessKey = createactivitiInWithBusinessKey;


/**
 * Create activiti:out element from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiOut(binding, value, bpmnFactory) {
  var properties = createactivitiInOutAttrs(binding, value);

  return bpmnFactory.create('activiti:Out', properties);
}

module.exports.createactivitiOut = createactivitiOut;


/**
 * Create activiti:executionListener element containing an inline script from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiExecutionListenerScript(binding, value, bpmnFactory) {
  var scriptFormat = binding.scriptFormat,
      parameterValue,
      parameterDefinition;

  if (scriptFormat) {
    parameterDefinition = bpmnFactory.create('activiti:Script', {
      scriptFormat: scriptFormat,
      value: value
    });
  } else {
    parameterValue = value;
  }

  return bpmnFactory.create('activiti:ExecutionListener', {
    event: binding.event,
    value: parameterValue,
    script: parameterDefinition
  });
}

module.exports.createactivitiExecutionListenerScript = createactivitiExecutionListenerScript;

/**
 * Create activiti:field element containing string or expression from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiFieldInjection(binding, value, bpmnFactory) {
  var DEFAULT_PROPS = {
    'string': undefined,
    'expression': undefined,
    'name': undefined
  };

  var props = assign({}, DEFAULT_PROPS);

  if (!binding.expression) {
    props.string = value;
  } else {
    props.expression = value;
  }
  props.name = binding.name;

  return bpmnFactory.create('activiti:Field', props);
}

module.exports.createactivitiFieldInjection = createactivitiFieldInjection;

/**
 * Create activiti:errorEventDefinition element containing expression and errorRef
 * from given binding.
 *
 * @param {PropertyBinding} binding
 * @param {String} value
 * @param {ModdleElement} error
 * @param {ModdleElement} parent
 * @param {BpmnFactory} bpmnFactory
 *
 * @return {ModdleElement}
 */
function createactivitiErrorEventDefinition(binding, value, error, parent, bpmnFactory) {
  var errorRef = error,
      expression = value;

  var newErrorEventDefinition = bpmnFactory.create('activiti:ErrorEventDefinition', {
    expression: expression,
    errorRef: errorRef
  });

  newErrorEventDefinition.$parent = parent;

  return newErrorEventDefinition;
}

module.exports.createactivitiErrorEventDefinition = createactivitiErrorEventDefinition;

/**
 * Create bpmn:error element containing a specific error id given by a binding.
 *
 * @param {String} bindingErrorRef
 * @param {ModdleElement} parent
 * @param {BpmnFactory} bpmnFactory
 *
 * @return { ModdleElement }
 */
function createError(bindingErrorRef, parent, bpmnFactory) {
  var error = bpmnFactory.create('bpmn:Error', {

    // we need to later retrieve the error from a binding
    id: nextId('Error_' + bindingErrorRef + '_')
  });

  error.$parent = parent;

  return error;
}

module.exports.createError = createError;

// helpers ////////////////////////////

/**
 * Create properties for activiti:in and activiti:out types.
 */
function createactivitiInOutAttrs(binding, value) {

  var properties = {};

  // activiti:in source(Expression) target
  if (binding.target) {

    properties.target = binding.target;

    if (binding.expression) {
      properties.sourceExpression = value;
    } else {
      properties.source = value;
    }
  } else

  // activiti:(in|out) variables local
  if (binding.variables) {
    properties.variables = 'all';

    if (binding.variables === 'local') {
      properties.local = true;
    }
  }

  // activiti:out source(Expression) target
  else {
    properties.target = value;

    [ 'source', 'sourceExpression' ].forEach(function(k) {
      if (binding[k]) {
        properties[k] = binding[k];
      }
    });
  }

  return properties;
}

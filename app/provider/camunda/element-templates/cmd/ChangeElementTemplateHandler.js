'use strict';

var findExtension = require('../Helper').findExtension,
    findExtensions = require('../Helper').findExtensions,
    findActivitiErrorEventDefinition = require('../Helper').findActivitiErrorEventDefinition;

var handleLegacyScopes = require('../util/handleLegacyScopes');

var createActivitiExecutionListenerScript = require('../CreateHelper').createActivitiExecutionListenerScript,
    createActivitiFieldInjection = require('../CreateHelper').createActivitiFieldInjection,
    createActivitiIn = require('../CreateHelper').createActivitiIn,
    createActivitiInWithBusinessKey = require('../CreateHelper').createActivitiInWithBusinessKey,
    createActivitiOut = require('../CreateHelper').createActivitiOut,
    createActivitiProperty = require('../CreateHelper').createActivitiProperty,
    createInputParameter = require('../CreateHelper').createInputParameter,
    createOutputParameter = require('../CreateHelper').createOutputParameter,
    createActivitiErrorEventDefinition = require('../CreateHelper').createActivitiErrorEventDefinition,
    createError = require('../CreateHelper').createError;

var EventDefinitionHelper = require('bpmn-js-properties-panel/lib/helper/EventDefinitionHelper');

var getRoot = require('bpmn-js-properties-panel/lib/Utils').getRoot;

var getBusinessObject = require('bpmn-js/lib/util/ModelUtil').getBusinessObject;

var is = require('bpmn-js/lib/util/ModelUtil').is,
    isAny = require('bpmn-js/lib/features/modeling/util/ModelingUtil').isAny;

var find = require('lodash/find'),
    forEach = require('lodash/forEach'),
    isString = require('lodash/isString'),
    keys = require('lodash/keys'),
    remove = require('lodash/remove');

var Activiti_SERVICE_TASK_LIKE = [
  'Activiti:class',
  'Activiti:delegateExpression',
  'Activiti:expression'
];

/**
 * Applies an element template to an element. Sets `Activiti:modelerTemplate` and
 * `Activiti:modelerTemplateVersion`.
 */
function ChangeElementTemplateHandler(bpmnFactory, commandStack, modeling) {
  this._bpmnFactory = bpmnFactory;
  this._commandStack = commandStack;
  this._modeling = modeling;
}

ChangeElementTemplateHandler.$inject = [
  'bpmnFactory',
  'commandStack',
  'modeling'
];

module.exports = ChangeElementTemplateHandler;

/**
   * Change an element's template and update its properties as specified in `newTemplate`. Specify
   * `oldTemplate` to update from one template to another. If `newTemplate` isn't specified the
   * `Activiti:modelerTemplate` and `Activiti:modelerTemplateVersion` properties will be removed from
   * the element.
   *
   * @param {Object} context
   * @param {Object} context.element
   * @param {Object} [context.oldTemplate]
   * @param {Object} [context.newTemplate]
   */
ChangeElementTemplateHandler.prototype.preExecute = function(context) {
  var element = context.element,
      newTemplate = context.newTemplate,
      oldTemplate = context.oldTemplate;

  var self = this;

  // Update Activiti:modelerTemplate attribute
  this._updateActivitiModelerTemplate(element, newTemplate);

  if (newTemplate) {

    // Update properties
    this._updateProperties(element, oldTemplate, newTemplate);

    // Update Activiti:ExecutionListener properties
    this._updateActivitiExecutionListenerProperties(element, newTemplate);

    // Update Activiti:Field properties
    this._updateActivitiFieldProperties(element, oldTemplate, newTemplate);

    // Update Activiti:In and Activiti:Out properties
    this._updateActivitiInOutProperties(element, oldTemplate, newTemplate);

    // Update Activiti:InputParameter and Activiti:OutputParameter properties
    this._updateActivitiInputOutputParameterProperties(element, oldTemplate, newTemplate);

    // Update Activiti:Property properties
    this._updateActivitiPropertyProperties(element, oldTemplate, newTemplate);

    // Update Activiti:ErrorEventDefinition properties
    this._updateActivitiErrorEventDefinitionProperties(element, oldTemplate, newTemplate);

    // Update properties for each scope
    forEach(handleLegacyScopes(newTemplate.scopes), function(newScopeTemplate) {
      self._updateScopeProperties(element, oldTemplate, newScopeTemplate, newTemplate);
    });

  }
};

ChangeElementTemplateHandler.prototype._getOrCreateExtensionElements = function(element) {
  var bpmnFactory = this._bpmnFactory,
      modeling = this._modeling;

  var businessObject = getBusinessObject(element);

  var extensionElements = businessObject.get('extensionElements');

  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', {
      values: []
    });

    extensionElements.$parent = businessObject;

    modeling.updateProperties(element, {
      extensionElements: extensionElements
    });
  }

  return extensionElements;
};

/**
 * Update `Activiti:ErrorEventDefinition` properties of specified business object. Event
 * definitions can only exist in `bpmn:ExtensionElements`.
 *
 * Ensures an bpmn:Error exists for the event definition.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiErrorEventDefinitionProperties = function(element, oldTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:errorEventDefinition';
  });

  // (1) Do not override if no updates
  if (!newProperties.length) {
    return;
  }

  var businessObject = this._getOrCreateExtensionElements(element);

  var oldErrorEventDefinitions = findExtensions(element, [ 'Activiti:ErrorEventDefinition' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldEventDefinition = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newBinding = newProperty.binding;

    // (2) Update old event definitions
    if (oldProperty && oldEventDefinition) {

      if (!propertyChanged(oldEventDefinition, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldEventDefinition,
          properties: {
            expression: newProperty.value
          }
        });
      }

      remove(oldErrorEventDefinitions, oldEventDefinition);
    }

    // (3) Create new event definition + error
    else {
      var rootElement = getRoot(getBusinessObject(element)),
          newError = createError(newBinding.errorRef, rootElement, bpmnFactory),
          newEventDefinition =
            createActivitiErrorEventDefinition(newBinding, newProperty.value, newError, businessObject, bpmnFactory);

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: rootElement,
        propertyName: 'rootElements',
        objectsToAdd: [ newError ],
        objectsToRemove: []
      });

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ newEventDefinition ],
        objectsToRemove: []
      });
    }

  });

  // (4) Remove old event definitions
  if (oldErrorEventDefinitions.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldErrorEventDefinitions
    });
  }
};

/**
 * Update `Activiti:ExecutionListener` properties of specified business object. Execution listeners
 * will always be overridden. Execution listeners can only exist in `bpmn:ExtensionElements`.
 *
 * @param {djs.model.Base} element
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiExecutionListenerProperties = function(element, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:executionListener';
  });

  // (1) Do not override old execution listeners if no new execution listeners specified
  if (!newProperties.length) {
    return;
  }

  var businessObject = this._getOrCreateExtensionElements(element);

  // (2) Remove old execution listeners
  var oldExecutionListeners = findExtensions(element, [ 'Activiti:ExecutionListener' ]);

  // (3) Add new execution listeners
  var newExecutionListeners = newProperties.map(function(newProperty) {
    var newBinding = newProperty.binding,
        propertyValue = newProperty.value;

    return createActivitiExecutionListenerScript(newBinding, propertyValue, bpmnFactory);
  });

  commandStack.execute('properties-panel.update-businessobject-list', {
    element: element,
    currentObject: businessObject,
    propertyName: 'values',
    objectsToAdd: newExecutionListeners,
    objectsToRemove: oldExecutionListeners
  });
};

/**
 * Update `Activiti:Field` properties of specified business object.
 * If business object is `Activiti:ExecutionListener` or `Activiti:TaskListener` `fields` property
 * will be updated. Otherwise `extensionElements.values` property will be updated.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 * @param {ModdleElement} businessObject
 */
ChangeElementTemplateHandler.prototype._updateActivitiFieldProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:field';
  });

  // (1) Do not override old fields if no new fields specified
  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var propertyName = isAny(businessObject, [ 'Activiti:ExecutionListener', 'Activiti:TaskListener' ])
    ? 'fields'
    : 'values';

  var oldFields = findExtensions(element, [ 'Activiti:Field' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldField = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newBinding = newProperty.binding;

    // (2) Update old fields
    if (oldProperty && oldField) {

      if (!propertyChanged(oldField, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldField,
          properties: {
            string: newProperty.value
          }
        });
      }

      remove(oldFields, oldField);
    }

    // (3) Add new fields
    else {
      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: propertyName,
        objectsToAdd: [ createActivitiFieldInjection(newBinding, newProperty.value, bpmnFactory) ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old fields
  if (oldFields.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: propertyName,
      objectsToAdd: [],
      objectsToRemove: oldFields
    });
  }
};

/**
 * Update `Activiti:In` and `Activiti:Out` properties of specified business object. Only
 * `bpmn:CallActivity` and events with `bpmn:SignalEventDefinition` can have ins. Only
 * `Activiti:CallActivity` can have outs.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiInOutProperties = function(element, oldTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:in'
      || newBindingType === 'Activiti:in:businessKey'
      || newBindingType === 'Activiti:out';
  });

  // (1) Do not override old fields if no new fields specified
  if (!newProperties.length) {
    return;
  }

  // Get extension elements of either signal event definition or call activity
  var businessObject = this._getOrCreateExtensionElements(
    EventDefinitionHelper.getSignalEventDefinition(element) || element);

  var oldInsAndOuts = findExtensions(businessObject, [ 'Activiti:In', 'Activiti:Out' ]);

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldBinding = oldProperty && oldProperty.binding,
        oldInOurOut = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding,
        newBindingType = newBinding.type,
        newInOrOut,
        properties = {};

    // (2) Update old ins and outs
    if (oldProperty && oldInOurOut) {

      if (!propertyChanged(oldInOurOut, oldProperty)) {
        if (newBindingType === 'Activiti:in') {
          if (newBinding.expression) {
            properties[ 'Activiti:sourceExpression' ] = newPropertyValue;
          } else {
            properties[ 'Activiti:source' ] = newPropertyValue;
          }
        } else if (newBindingType === 'Activiti:in:businessKey') {
          properties[ 'Activiti:businessKey' ] = newPropertyValue;
        } else if (newBindingType === 'Activiti:out') {
          properties[ 'Activiti:target' ] = newPropertyValue;
        }
      }

      // Update `Activiti:local` property if it changed
      if ((oldBinding.local && !newBinding.local) || !oldBinding.local && newBinding.local) {
        properties.local = newBinding.local;
      }

      if (keys(properties)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldInOurOut,
          properties: properties
        });
      }

      remove(oldInsAndOuts, oldInOurOut);
    }

    // (3) Add new ins and outs
    else {
      if (newBindingType === 'Activiti:in') {
        newInOrOut = createActivitiIn(newBinding, newPropertyValue, bpmnFactory);
      } else if (newBindingType === 'Activiti:out') {
        newInOrOut = createActivitiOut(newBinding, newPropertyValue, bpmnFactory);
      } else if (newBindingType === 'Activiti:in:businessKey') {
        newInOrOut = createActivitiInWithBusinessKey(newBinding, newPropertyValue, bpmnFactory);
      }

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ newInOrOut ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old ins and outs
  if (oldInsAndOuts.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldInsAndOuts
    });
  }
};

/**
 * Update `Activiti:InputParameter` and `Activiti:OutputParameter` properties of specified business
 * object. Both can only exist in `Activiti:InputOutput` which can exist in `bpmn:ExtensionElements`
 * or `Activiti:Connector`.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateActivitiInputOutputParameterProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:inputParameter' || newBindingType === 'Activiti:outputParameter';
  });

  // (1) Do not override old inputs and outputs if no new inputs and outputs specified
  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var inputOutput;

  if (is(businessObject, 'Activiti:Connector')) {
    inputOutput = businessObject.get('Activiti:inputOutput');

    if (!inputOutput) {
      inputOutput = bpmnFactory.create('Activiti:InputOutput');

      commandStack.execute('properties-panel.update-businessobject', {
        element: element,
        businessObject: businessObject,
        properties: {
          inputOutput: inputOutput
        }
      });
    }
  } else {
    inputOutput = findExtension(businessObject, 'Activiti:InputOutput');

    if (!inputOutput) {
      inputOutput = bpmnFactory.create('Activiti:InputOutput');

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: businessObject,
        propertyName: 'values',
        objectsToAdd: [ inputOutput ],
        objectsToRemove: []
      });
    }
  }

  var oldInputs = inputOutput.get('Activiti:inputParameters')
    ? inputOutput.get('Activiti:inputParameters').slice()
    : [];

  var oldOutputs = inputOutput.get('Activiti:outputParameters')
    ? inputOutput.get('Activiti:outputParameters').slice()
    : [];

  var propertyName;

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldInputOrOutput = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    var newInputOrOutput,
        properties;

    // (2) Update old inputs and outputs
    if (oldProperty && oldInputOrOutput) {

      if (!propertyChanged(oldInputOrOutput, oldProperty)) {
        if (is(oldInputOrOutput, 'Activiti:InputParameter')) {
          properties = {
            value: newPropertyValue
          };
        } else {
          properties = {
            name: newPropertyValue
          };
        }

        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldInputOrOutput,
          properties: properties
        });
      }

      if (is(oldInputOrOutput, 'Activiti:InputParameter')) {
        remove(oldInputs, oldInputOrOutput);
      } else {
        remove(oldOutputs, oldInputOrOutput);
      }
    }

    // (3) Add new inputs and outputs
    else {
      if (newBindingType === 'Activiti:inputParameter') {
        propertyName = 'inputParameters';

        newInputOrOutput = createInputParameter(newBinding, newPropertyValue, bpmnFactory);
      } else {
        propertyName = 'outputParameters';

        newInputOrOutput = createOutputParameter(newBinding, newPropertyValue, bpmnFactory);
      }

      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: inputOutput,
        propertyName: propertyName,
        objectsToAdd: [ newInputOrOutput ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old inputs and outputs
  if (oldInputs.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: inputOutput,
      propertyName: 'inputParameters',
      objectsToAdd: [],
      objectsToRemove: oldInputs
    });
  }

  if (oldOutputs.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: inputOutput,
      propertyName: 'outputParameters',
      objectsToAdd: [],
      objectsToRemove: oldOutputs
    });
  }
};

ChangeElementTemplateHandler.prototype._updateActivitiModelerTemplate = function(element, newTemplate) {
  var modeling = this._modeling;

  modeling.updateProperties(element, {
    'Activiti:modelerTemplate': newTemplate && newTemplate.id,
    'Activiti:modelerTemplateVersion': newTemplate && newTemplate.version
  });
};

/**
 * Update `Activiti:Property` properties of specified business object. `Activiti:Property` can only
 * exist in `Activiti:Properties`.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newTemplate
 * @param {ModdleElement} businessObject
 */
ChangeElementTemplateHandler.prototype._updateActivitiPropertyProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'Activiti:property';
  });

  // (1) Do not override old properties if no new properties specified
  if (!newProperties.length) {
    return;
  }

  if (businessObject) {
    businessObject = this._getOrCreateExtensionElements(businessObject);
  } else {
    businessObject = this._getOrCreateExtensionElements(element);
  }

  var ActivitiProperties = findExtension(businessObject, 'Activiti:Properties');

  if (!ActivitiProperties) {
    ActivitiProperties = bpmnFactory.create('Activiti:Properties');

    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: businessObject,
      propertyName: 'values',
      objectsToAdd: [ ActivitiProperties ],
      objectsToRemove: []
    });
  }

  var oldActivitiProperties = ActivitiProperties.get('Activiti:values')
    ? ActivitiProperties.get('Activiti:values').slice()
    : [];

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        oldActivitiProperty = oldProperty && findOldBusinessObject(businessObject, oldProperty),
        newPropertyValue = newProperty.value,
        newBinding = newProperty.binding;

    // (2) Update old properties
    if (oldProperty && oldActivitiProperty) {

      if (!propertyChanged(oldActivitiProperty, oldProperty)) {
        commandStack.execute('properties-panel.update-businessobject', {
          element: element,
          businessObject: oldActivitiProperty,
          properties: {
            value: newPropertyValue
          }
        });
      }

      remove(oldActivitiProperties, oldActivitiProperty);
    }

    // (3) Add new properties
    else {
      commandStack.execute('properties-panel.update-businessobject-list', {
        element: element,
        currentObject: ActivitiProperties,
        propertyName: 'values',
        objectsToAdd: [ createActivitiProperty(newBinding, newPropertyValue, bpmnFactory) ],
        objectsToRemove: []
      });
    }
  });

  // (4) Remove old properties
  if (oldActivitiProperties.length) {
    commandStack.execute('properties-panel.update-businessobject-list', {
      element: element,
      currentObject: ActivitiProperties,
      propertyName: 'values',
      objectsToAdd: [],
      objectsToRemove: oldActivitiProperties
    });
  }
};

/**
 * Update `bpmn:conditionExpression` property of specified element. Since condition expression is
 * is not primitive it needs special handling.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldProperty
 * @param {Object} newProperty
 */
ChangeElementTemplateHandler.prototype._updateConditionExpression = function(element, oldProperty, newProperty) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack,
      modeling = this._modeling;

  var newBinding = newProperty.binding,
      newPropertyValue = newProperty.value;

  if (!oldProperty) {
    modeling.updateProperties(element, {
      conditionExpression: bpmnFactory.create('bpmn:FormalExpression', {
        body: newPropertyValue,
        language: newBinding.scriptFormat
      })
    });

    return;
  }

  var oldBinding = oldProperty.binding,
      oldPropertyValue = oldProperty.value;

  var businessObject = getBusinessObject(element),
      conditionExpression = businessObject.get('bpmn:conditionExpression');

  var properties = {};

  if (conditionExpression.get('body') === oldPropertyValue) {
    properties.body = newPropertyValue;
  }

  if (conditionExpression.get('language') === oldBinding.scriptFormat) {
    properties.language = newBinding.scriptFormat;
  }

  if (!keys(properties).length) {
    return;
  }

  commandStack.execute('properties-panel.update-businessobject', {
    element: element,
    businessObject: conditionExpression,
    properties: properties
  });
};

ChangeElementTemplateHandler.prototype._updateProperties = function(element, oldTemplate, newTemplate, businessObject) {
  var self = this;

  var commandStack = this._commandStack;

  var newProperties = newTemplate.properties.filter(function(newProperty) {
    var newBinding = newProperty.binding,
        newBindingType = newBinding.type;

    return newBindingType === 'property';
  });

  if (!newProperties.length) {
    return;
  }

  if (!businessObject) {
    businessObject = getBusinessObject(element);
  }

  newProperties.forEach(function(newProperty) {
    var oldProperty = findOldProperty(oldTemplate, newProperty),
        newBinding = newProperty.binding,
        newBindingName = newBinding.name,
        newPropertyValue = newProperty.value,
        changedElement,
        properties;

    if (newBindingName === 'conditionExpression') {
      self._updateConditionExpression(element, oldProperty, newProperty);
    } else {

      if (is(businessObject, 'bpmn:Error')) {
        changedElement = businessObject;
      } else {
        changedElement = element;
      }

      if (oldProperty && propertyChanged(changedElement, oldProperty)) {
        return;
      }

      properties = {};

      properties[ newBindingName ] = newPropertyValue;

      // Only one of `Activiti:class`, `Activiti:delegateExpression` and `Activiti:expression` can be
      // set
      // TODO(philippfromme): ensuring only one of these properties is set at a time should be
      // implemented in a behavior and not in this handler and properties panel UI
      if (Activiti_SERVICE_TASK_LIKE.indexOf(newBindingName) !== -1) {
        Activiti_SERVICE_TASK_LIKE.forEach(function(ActivitiServiceTaskLikeProperty) {
          if (ActivitiServiceTaskLikeProperty !== newBindingName) {
            properties[ ActivitiServiceTaskLikeProperty ] = undefined;
          }
        });
      }

      commandStack.execute('properties-panel.update-businessobject', {
        element: element,
        businessObject: businessObject,
        properties: properties
      });
    }
  });
};

/**
 * Update properties for a specified scope.
 *
 * @param {djs.model.Base} element
 * @param {Object} oldTemplate
 * @param {Object} newScopeTemplate
 * @param {Object} newTemplate
 */
ChangeElementTemplateHandler.prototype._updateScopeProperties = function(element, oldTemplate, newScopeTemplate, newTemplate) {
  var bpmnFactory = this._bpmnFactory,
      commandStack = this._commandStack;

  var scopeName = newScopeTemplate.type;

  var scopeElement;

  scopeElement = findOldScopeElement(element, newScopeTemplate, newTemplate);

  if (!scopeElement) {

    scopeElement = bpmnFactory.create(scopeName);
  }

  var oldScopeTemplate = findOldScopeTemplate(newScopeTemplate, oldTemplate);

  // Update properties
  this._updateProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update Activiti:ExecutionListener properties
  this._updateActivitiExecutionListenerProperties(element, newScopeTemplate);

  // Update Activiti:In and Activiti:Out properties
  this._updateActivitiInOutProperties(element, oldScopeTemplate, newScopeTemplate);

  // Update Activiti:InputParameter and Activiti:OutputParameter properties
  this._updateActivitiInputOutputParameterProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update Activiti:Field properties
  this._updateActivitiFieldProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Update Activiti:Property properties
  this._updateActivitiPropertyProperties(element, oldScopeTemplate, newScopeTemplate, scopeElement);

  // Assume: root elements were already been created in root by referenced event
  // definition binding
  if (isRootElementScope(scopeName)) {
    return;
  }

  var extensionElements = this._getOrCreateExtensionElements(element);

  commandStack.execute('properties-panel.update-businessobject-list', {
    element: element,
    currentObject: extensionElements,
    propertyName: 'values',
    objectsToAdd: [ scopeElement ],
    objectsToRemove: []
  });
};

// helpers //////////

/**
 * Find old business object matching specified old property.
 *
 * @param {djs.model.Base|ModdleElement} element
 * @param {Object} oldProperty
 *
 * @returns {ModdleElement}
 */
function findOldBusinessObject(element, oldProperty) {
  var businessObject = getBusinessObject(element),
      propertyName;

  var oldBinding = oldProperty.binding,
      oldBindingType = oldBinding.type;

  if (oldBindingType === 'Activiti:field') {

    if (isAny(businessObject, [ 'Activiti:ExecutionListener', 'Activiti:TaskListener' ])) {
      propertyName = 'Activiti:fields';
    } else {
      propertyName = 'bpmn:values';
    }

    if (!businessObject || !businessObject.get(propertyName) || !businessObject.get(propertyName).length) {
      return;
    }

    return find(businessObject.get(propertyName), function(oldBusinessObject) {
      return oldBusinessObject.get('Activiti:name') === oldBinding.name;
    });
  }

  if (oldBindingType === 'Activiti:in') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('target') === oldBinding.target;
    });
  }

  if (oldBindingType === 'Activiti:in:businessKey') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return isString(oldBusinessObject.get('businessKey'));
    });
  }

  if (oldBindingType === 'Activiti:out') {
    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('source') === oldBinding.source ||
        oldBusinessObject.get('sourceExpression') || oldBinding.sourceExpression;
    });
  }

  if (oldBindingType === 'Activiti:inputParameter' || oldBindingType === 'Activiti:outputParameter') {

    if (is(businessObject, 'Activiti:Connector')) {
      businessObject = businessObject.get('Activiti:inputOutput');

      if (!businessObject) {
        return;
      }
    } else {
      businessObject = findExtension(businessObject, 'Activiti:InputOutput');

      if (!businessObject) {
        return;
      }
    }

    if (oldBindingType === 'Activiti:inputParameter') {
      return find(businessObject.get('Activiti:inputParameters'), function(oldBusinessObject) {
        return oldBusinessObject.get('Activiti:name') === oldBinding.name;
      });
    } else {
      return find(businessObject.get('Activiti:outputParameters'), function(oldBusinessObject) {
        var definition;

        if (oldBinding.scriptFormat) {
          definition = oldBusinessObject.get('Activiti:definition');

          return definition && definition.get('Activiti:value') === oldBinding.source;
        } else {
          return oldBusinessObject.get('Activiti:value') === oldBinding.source;
        }
      });
    }

  }

  if (oldBindingType === 'Activiti:property') {
    if (!businessObject || !businessObject.get('values') || !businessObject.get('values').length) {
      return;
    }

    businessObject = findExtension(businessObject, 'Activiti:Properties');

    if (!businessObject) {
      return;
    }

    return find(businessObject.get('values'), function(oldBusinessObject) {
      return oldBusinessObject.get('Activiti:name') === oldBinding.name;
    });
  }

  if (oldBindingType === 'Activiti:errorEventDefinition') {
    return findActivitiErrorEventDefinition(element, oldBinding.errorRef);
  }
}

/**
 * Find old property matching specified new property.
 *
 * @param {Object} oldTemplate
 * @param {Object} newProperty
 *
 * @returns {Object}
 */
function findOldProperty(oldTemplate, newProperty) {
  if (!oldTemplate) {
    return;
  }

  var oldProperties = oldTemplate.properties,
      newBinding = newProperty.binding,
      newBindingName = newBinding.name,
      newBindingType = newBinding.type;

  if (newBindingType === 'property') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'property' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'Activiti:field') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'Activiti:field' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'Activiti:in') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'Activiti:in') {
        return;
      }

      // Always override if change from source to source expression or vice versa
      if ((oldBinding.expression && !newBinding.expression) ||
        !oldBinding.expression && newBinding.expression) {
        return;
      }

      return oldBinding.target === newBinding.target;
    });
  }

  if (newBindingType === 'Activiti:in:businessKey') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'Activiti:in:businessKey';
    });
  }

  if (newBindingType === 'Activiti:out') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'Activiti:out' && (
        oldBinding.source === newBinding.source ||
        oldBinding.sourceExpression === newBinding.sourceExpression
      );
    });
  }

  if (newBindingType === 'Activiti:inputParameter') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'Activiti:inputParameter') {
        return;
      }

      return oldBindingName === newBindingName
        && oldBinding.scriptFormat === newBinding.scriptFormat;
    });
  }

  if (newBindingType === 'Activiti:outputParameter') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingType = oldBinding.type;

      if (oldBindingType !== 'Activiti:outputParameter') {
        return;
      }

      return oldBinding.source === newBinding.source
        && oldBinding.scriptFormat === newBinding.scriptFormat;
    });
  }

  if (newBindingType === 'Activiti:property') {
    return find(oldProperties, function(oldProperty) {
      var oldBinding = oldProperty.binding,
          oldBindingName = oldBinding.name,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'Activiti:property' && oldBindingName === newBindingName;
    });
  }

  if (newBindingType === 'Activiti:errorEventDefinition') {
    return find(oldProperties, function(oldProperty) {
      var newBindingRef = newBinding.errorRef,
          oldBinding = oldProperty.binding,
          oldBindingRef = oldBinding.errorRef,
          oldBindingType = oldBinding.type;

      return oldBindingType === 'Activiti:errorEventDefinition'
        && oldBindingRef === newBindingRef;
    });
  }
}

function findOldScopeElement(element, scopeTemplate, template) {
  var scopeName = scopeTemplate.type,
      id = scopeTemplate.id;

  if (scopeName === 'Activiti:Connector') {
    return findExtension(element, 'Activiti:Connector');
  }

  if (scopeName === 'bpmn:Error') {

    // (1) find by error event definition binding
    var errorEventDefinitionBinding = findErrorEventDefinitionBinding(template, id);

    if (!errorEventDefinitionBinding) {
      return;
    }

    // (2) find error event definition
    var errorEventDefinition = findOldBusinessObject(element, errorEventDefinitionBinding);

    if (!errorEventDefinition) {
      return;
    }

    // (3) retrieve referenced error
    return errorEventDefinition.errorRef;
  }
}

function isRootElementScope(scopeName) {
  return [ 'bpmn:Error' ].includes(scopeName);
}

function findOldScopeTemplate(scopeTemplate, oldTemplate) {
  var scopeName = scopeTemplate.type,
      scopeId = scopeTemplate.id,
      scopes = oldTemplate && handleLegacyScopes(oldTemplate.scopes);

  return scopes && find(scopes, function(scope) {

    if (isRootElementScope(scopeName)) {
      return scope.id === scopeId;
    }

    return scope.type === scopeName;
  });
}

function findErrorEventDefinitionBinding(template, templateErrorId) {
  return find(template.properties, function(property) {
    return property.binding.errorRef === templateErrorId;
  });
}

/**
 * Check whether property was changed after being set by template.
 *
 * @param {djs.model.Base|ModdleElement} element
 * @param {Object} oldProperty
 *
 * @returns {boolean}
 */
function propertyChanged(element, oldProperty) {
  var businessObject = getBusinessObject(element);

  var oldBinding = oldProperty.binding,
      oldBindingName = oldBinding.name,
      oldBindingType = oldBinding.type,
      oldPropertyValue = oldProperty.value,
      conditionExpression,
      definition;

  if (oldBindingType === 'property') {
    if (oldBindingName === 'conditionExpression') {
      conditionExpression = businessObject.get('bpmn:conditionExpression');

      return conditionExpression.get('bpmn:body') !== oldPropertyValue;
    }

    return businessObject.get(oldBindingName) !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:field') {
    return businessObject.get('Activiti:string') !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:in') {
    if (oldBinding.expression) {
      return businessObject.get('sourceExpression') !== oldPropertyValue;
    } else {
      return businessObject.get('Activiti:source') !== oldPropertyValue;
    }
  }

  if (oldBindingType === 'Activiti:in:businessKey') {
    return businessObject.get('Activiti:businessKey') !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:out') {
    return businessObject.get('Activiti:target') !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:inputParameter') {
    if (oldBinding.scriptFormat) {
      definition = businessObject.get('Activiti:definition');

      return definition && definition.get('Activiti:value') !== oldPropertyValue;
    } else {
      return businessObject.get('Activiti:value') !== oldPropertyValue;
    }
  }

  if (oldBindingType === 'Activiti:outputParameter') {
    return businessObject.get('Activiti:name') !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:property') {
    return businessObject.get('Activiti:value') !== oldPropertyValue;
  }

  if (oldBindingType === 'Activiti:errorEventDefinition') {
    return businessObject.get('expression') !== oldPropertyValue;
  }
}
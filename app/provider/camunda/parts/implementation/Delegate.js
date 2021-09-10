'use strict';

var entryFactory = require('bpmn-js-properties-panel/lib/factory/EntryFactory'),
    cmdHelper = require('bpmn-js-properties-panel/lib/helper/CmdHelper');

var DELEGATE_TYPES = [
  'class',
  'expression',
  'delegateExpression'
];

var PROPERTIES = {
  class: 'activiti:class',
  expression: 'activiti:expression',
  delegateExpression: 'activiti:delegateExpression'
};

function isDelegate(type) {
  return DELEGATE_TYPES.indexOf(type) !== -1;
}

function getAttribute(type) {
  return PROPERTIES[type];
}


module.exports = function(element, bpmnFactory, options, translate) {

  var getImplementationType = options.getImplementationType,
      getBusinessObject = options.getBusinessObject;

  function getDelegationLabel(type) {
    switch (type) {
    case 'class':
      return translate('Java Class');
    case 'expression':
      return translate('Expression');
    case 'delegateExpression':
      return translate('Delegate Expression');
    default:
      return '';
    }
  }

  var delegateEntry = entryFactory.textField(translate, {
    id: 'delegate',
    label: translate('Value'),
    dataValueLabel: 'delegationLabel',
    modelProperty: 'delegate',

    get: function(element, node) {
      var bo = getBusinessObject(element);
      var type = getImplementationType(element);
      var attr = getAttribute(type);
      var label = getDelegationLabel(type);
      return {
        delegate: bo.get(attr),
        delegationLabel: label
      };
    },

    set: function(element, values, node) {
      var bo = getBusinessObject(element);
      var type = getImplementationType(element);
      var attr = getAttribute(type);
      var prop = {};
      prop[attr] = values.delegate || '';
      return cmdHelper.updateBusinessObject(element, bo, prop);
    },

    validate: function(element, values, node) {
      return isDelegate(getImplementationType(element)) && !values.delegate ? { delegate: translate('Must provide a value') } : {};
    },

    hidden: function(element, node) {
      return !isDelegate(getImplementationType(element));
    }

  });

  return [ delegateEntry ];

};

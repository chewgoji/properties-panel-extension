'use strict';

var entryFactory = require('bpmn-js-properties-panel/lib/factory/EntryFactory');

var cmdHelper = require('bpmn-js-properties-panel/lib/helper/CmdHelper');

module.exports = function(element, bpmnFactory, options, translate) {

  var getBusinessObject = options.getBusinessObject;

  var candidateStarterGroupsEntry = entryFactory.textField(translate, {
    id: 'candidateStarterGroups',
    label: translate('Candidate Starter Groups'),
    modelProperty: 'candidateStarterGroups',
    description: translate('Specify more than one group as a comma separated list.'),

    get: function(element, node) {
      var bo = getBusinessObject(element);
      var candidateStarterGroups = bo.get('activiti:candidateStarterGroups');

      return {
        candidateStarterGroups: candidateStarterGroups ? candidateStarterGroups : ''
      };
    },

    set: function(element, values) {
      var bo = getBusinessObject(element);
      return cmdHelper.updateBusinessObject(element, bo, {
        'activiti:candidateStarterGroups': values.candidateStarterGroups || undefined
      });
    }

  });

  var candidateStarterUsersEntry = entryFactory.textField(translate, {
    id: 'candidateStarterUsers',
    label: translate('Candidate Starter Users'),
    modelProperty: 'candidateStarterUsers',
    description: translate('Specify more than one user as a comma separated list.'),

    get: function(element, node) {
      var bo = getBusinessObject(element);
      var candidateStarterUsers = bo.get('activiti:candidateStarterUsers');

      return {
        candidateStarterUsers: candidateStarterUsers ? candidateStarterUsers : ''
      };
    },

    set: function(element, values) {
      var bo = getBusinessObject(element);
      return cmdHelper.updateBusinessObject(element, bo, {
        'activiti:candidateStarterUsers': values.candidateStarterUsers || undefined
      });
    }

  });

  return [
    candidateStarterGroupsEntry,
    candidateStarterUsersEntry
  ];
};

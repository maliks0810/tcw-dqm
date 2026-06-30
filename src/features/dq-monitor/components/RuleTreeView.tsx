import React, { useState } from "react";

export type RuleTreeSelection = {
  group: string;
  type: string;
  rule: string;
};

// Rule leaf shape: `name` is the identifier the tree passes back to the
// parent (and the backend uses for queries / filters); `label` is what
// the tree renders. label typically resolves to RULE_DESCRIPTION when
// present, RULE_NAME otherwise — but that policy lives in the caller.
export type RuleTreeRule = {
  name: string;
  label: string;
};

type Props = {
  groups: string[];
  getTypes: (group: string) => Promise<string[]>;
  getRules: (type: string) => Promise<RuleTreeRule[]>;
  selection: RuleTreeSelection;
  hasSelection?: boolean;
  onSelectAll: () => void;
  onSelectGroup: (group: string) => void;
  onSelectType: (group: string, type: string) => void;
  // ruleLabel mirrors what the tree rendered for the leaf (description-or-
  // name); the parent uses it to label headers / breadcrumbs without
  // having to repeat the description lookup.
  onSelectRule: (group: string, type: string, rule: string, ruleLabel: string) => void;
};

export default function RuleTreeView({
  groups,
  getTypes,
  getRules,
  selection,
  hasSelection = true,
  onSelectAll,
  onSelectGroup,
  onSelectType,
  onSelectRule,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [typesByGroup, setTypesByGroup] = useState<Record<string, string[]>>({});
  const [rulesByType, setRulesByType] = useState<Record<string, RuleTreeRule[]>>({});

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
        if (typesByGroup[group] === undefined) {
          getTypes(group)
            .then((types) =>
              setTypesByGroup((p) => ({ ...p, [group]: types }))
            )
            .catch(() =>
              setTypesByGroup((p) => ({ ...p, [group]: [] }))
            );
        }
      }
      return next;
    });
  };

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
        if (rulesByType[type] === undefined) {
          getRules(type)
            .then((rules) =>
              setRulesByType((p) => ({ ...p, [type]: rules }))
            )
            .catch((e: unknown) => {
              // Surface the cause to the console so a 500 from the
              // backend doesn't look like "the catalog has no rules"
              // — the tree still drops to the empty "(no rules)"
              // placeholder, but at least the failure is visible.
              // eslint-disable-next-line no-console
              console.error(`RuleTreeView: getRules("${type}") failed`, e);
              setRulesByType((p) => ({ ...p, [type]: [] }));
            });
        }
      }
      return next;
    });
  };

  const isAllSelected =
    hasSelection &&
    (!selection.group || selection.group === "All") &&
    (!selection.type || selection.type === "All") &&
    (!selection.rule || selection.rule === "All");

  const isGroupSelected = (g: string) =>
    hasSelection &&
    selection.group === g &&
    (!selection.type || selection.type === "All") &&
    (!selection.rule || selection.rule === "All");

  const isTypeSelected = (g: string, t: string) =>
    hasSelection &&
    selection.group === g &&
    selection.type === t &&
    (!selection.rule || selection.rule === "All");

  const isRuleSelected = (g: string, t: string, r: string) =>
    hasSelection &&
    selection.group === g && selection.type === t && selection.rule === r;

  return (
    <div className="dq-tree">
      <div className="dq-tree-row">
        <span className="dq-tree-toggle dq-tree-toggle-empty" />
        <button
          type="button"
          className={
            "dq-tree-node" + (isAllSelected ? " dq-tree-node-selected" : "")
          }
          onClick={onSelectAll}
        >
          All
        </button>
      </div>

      {groups.map((group) => {
        const groupExpanded = expandedGroups.has(group);
        const types = typesByGroup[group];
        return (
          <div key={group}>
            <div className="dq-tree-row">
              <button
                type="button"
                className="dq-tree-toggle"
                onClick={() => toggleGroup(group)}
                aria-label={groupExpanded ? "Collapse" : "Expand"}
              >
                {groupExpanded ? "▾" : "▸"}
              </button>
              <button
                type="button"
                className={
                  "dq-tree-node" +
                  (isGroupSelected(group) ? " dq-tree-node-selected" : "")
                }
                title={group}
                onClick={() => onSelectGroup(group)}
              >
                {group}
              </button>
            </div>

            {groupExpanded && (types ?? []).map((type) => {
              const typeExpanded = expandedTypes.has(type);
              const rules = rulesByType[type];
              return (
                <div key={`${group}::${type}`}>
                  <div className="dq-tree-row dq-tree-row-l1">
                    <button
                      type="button"
                      className="dq-tree-toggle"
                      onClick={() => toggleType(type)}
                      aria-label={typeExpanded ? "Collapse" : "Expand"}
                    >
                      {typeExpanded ? "▾" : "▸"}
                    </button>
                    <button
                      type="button"
                      className={
                        "dq-tree-node" +
                        (isTypeSelected(group, type)
                          ? " dq-tree-node-selected"
                          : "")
                      }
                      title={type}
                      onClick={() => onSelectType(group, type)}
                    >
                      {type}
                    </button>
                  </div>

                  {typeExpanded && (rules ?? []).map((rule) => (
                    <div
                      key={`${group}::${type}::${rule.name}`}
                      className="dq-tree-row dq-tree-row-l2"
                    >
                      <span className="dq-tree-toggle dq-tree-toggle-empty" />
                      <button
                        type="button"
                        className={
                          "dq-tree-node" +
                          (isRuleSelected(group, type, rule.name)
                            ? " dq-tree-node-selected"
                            : "")
                        }
                        title={rule.label}
                        onClick={() =>
                          onSelectRule(group, type, rule.name, rule.label)
                        }
                      >
                        {rule.label}
                      </button>
                    </div>
                  ))}

                  {typeExpanded && rules && rules.length === 0 && (
                    <div className="dq-tree-row dq-tree-row-l2 dq-tree-empty">
                      (no rules)
                    </div>
                  )}
                </div>
              );
            })}

            {groupExpanded && types && types.length === 0 && (
              <div className="dq-tree-row dq-tree-row-l1 dq-tree-empty">
                (no rule types)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

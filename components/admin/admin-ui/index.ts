// Admin UX shared primitives (A0 §2). Every admin list uses AdminDataView.
export {
  AdminDataView,
  AdminViewModeOverride,
  type AdminColumn,
  type AdminDataViewContext,
  type AdminDataViewProps,
} from "./admin-data-view";
export { AdminDataCard, type AdminDataCardField } from "./admin-data-card";
export { AdminViewToggle } from "./admin-view-toggle";
export { useAdminViewMode } from "./use-admin-view-mode";
export { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass, adminTouchFieldClass } from "./admin-controls";
export { AdminHierarchyPicker, type AdminHierarchyPickerProps } from "./admin-hierarchy-picker";
export { AdminOptionRows, optionRowsProblemText, type AdminOptionRowsProps } from "./admin-option-rows";
export { AdminUrgencyBadge, ADMIN_URGENCY_ICONS } from "./admin-urgency-badge";
export { AdminKpiRow, type AdminKpi } from "./admin-kpi";

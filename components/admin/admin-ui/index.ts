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
export { AdminSubnav } from "./admin-subnav";
export { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "./admin-controls";

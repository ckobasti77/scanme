// ADMIN v2 — sidebar of `Klijenti`: search, status and sort. The values are
// the arguments of `adminReadModels.listClients`.

import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { adminUiSr as ui } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import type { SidebarConfig } from "../types";

export const clientsSidebar: SidebarConfig = {
  id: "klijenti",
  search: { key: "q", label: dict.clientsSearchLabel, placeholder: dict.clientsSearchPlaceholder },
  groups: [
    {
      id: "status",
      label: ui.filters.status,
      options: [
        { value: "active", label: dict.clientsStatusActive },
        { value: "archived", label: dict.clientsStatusArchived },
      ],
    },
  ],
  sort: {
    key: "sort",
    label: ui.filters.sort,
    defaultValue: "urgency",
    options: [
      { value: "urgency", label: dict.clientsSortUrgency },
      { value: "name", label: dict.clientsSortName },
      { value: "recent", label: dict.clientsSortRecent },
    ],
  },
};

export const CLIENTS_URL_FIELDS = sidebarUrlFields(clientsSidebar);

import {
  GridIcon,
  DocsIcon,
  ListIcon,
  TableIcon,
  PaperPlaneIcon,
  UserCircleIcon,
  CalenderIcon,
  DollarLineIcon,
  UserIcon,
  LockIcon,
  GroupIcon,
  BoxCubeIcon,
  ShootingStarIcon,
  AlertIcon,
  PlugInIcon,
  PageIcon,
  PencilIcon,
  FolderIcon,
  FileIcon,
} from "@/icons/index";
import { PermissionCode } from "@/lib/permissions";

export type NavSubItem = {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
  label?: string;
  icon?: React.ReactNode;
  permissionCode?: string;
  comingSoon?: boolean;
};

export type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  label?: string;
  permissionCode?: string;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  /** Small chip rendered next to the label, e.g. "Real Admin". */
  badge?: string;
  /** Visible only to the configured super admin email (NEXT_PUBLIC_REAL_ADMIN_EMAIL). */
  realAdminOnly?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        icon: <GridIcon />,
        name: "Dashboard",
        path: "/admin",
      },
    ],
  },
  {
    title: "Bookings",
    items: [
      {
        icon: <ListIcon />,
        name: "Bookings",
        permissionCode: PermissionCode.BOOKINGS_READ,
        subItems: [
          { name: "All Bookings", path: "/admin/bookings", icon: <TableIcon /> },
          { name: "Agent Bookings", path: "/admin/agent-bookings", icon: <TableIcon /> },
          { name: "Flights Bookings", path: "/admin/bookings?tab=flights", icon: <PaperPlaneIcon /> },
          { name: "Hotel Bookings", path: "/admin/bookings?tab=hotels", icon: <CalenderIcon /> },
        ],
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        icon: <BoxCubeIcon />,
        name: "Hotels",
        // UI shows only Manual — the content-management sub-pages stay
        // reachable by URL for future re-enable.
        subItems: [
          { name: "Manual", path: "/admin/hotels/manual", icon: <PencilIcon /> },
        ],
      },
      {
        icon: <PaperPlaneIcon />,
        name: "Flights",
        subItems: [
          { name: "Manual", path: "/admin/flights/manual", icon: <PencilIcon /> },
        ],
      },
    ],
  },
  {
    title: "Commerce",
    items: [
      {
        icon: <DollarLineIcon />,
        name: "Payment Gateways",
        path: "/admin/settings/payment",
        permissionCode: PermissionCode.SETTINGS_MANAGE_PAYMENTS,
      },
      {
        icon: <DollarLineIcon />,
        name: "Markups",
        path: "/admin/settings/markups",
        permissionCode: PermissionCode.CUSTOMER_MARKUP_READ,
      },
      {
        icon: <DocsIcon />,
        name: "Invoices",
        path: "/admin/invoices",
        permissionCode: PermissionCode.INVOICES_READ,
      },
      {
        icon: <DollarLineIcon />,
        name: "Promo Codes",
        path: "/admin/promo-codes",
        permissionCode: PermissionCode.PROMO_CODES_READ,
      },
    ],
  },
  {
    title: "Users",
    items: [
      {
        icon: <UserIcon />,
        name: "Users Management",
        permissionCode: PermissionCode.USERS_READ,
        subItems: [
          { name: "All Users", path: "/admin/users", icon: <UserCircleIcon /> },
          { name: "Staff Users", path: "/admin/users/staff", icon: <UserCircleIcon /> },
          { name: "Customers", path: "/admin/customers", icon: <UserCircleIcon /> },
          { name: "Agents & Subagents", path: "/admin/agents", icon: <GroupIcon />, permissionCode: PermissionCode.AGENTS_READ },
          { name: "Roles & Permissions", path: "/admin/roles", icon: <LockIcon />, permissionCode: PermissionCode.USERS_MANAGE_ROLES },
        ],
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        icon: <PageIcon />,
        name: "CMS",
        subItems: [
          { name: "Pages", path: "/admin/cms/pages", icon: <PageIcon /> },
          { name: "Menus", path: "/admin/cms/menus", icon: <GridIcon /> },
          { name: "Footer Categories", path: "/admin/cms/footer-categories", icon: <DocsIcon /> },
          { name: "Blog Posts", path: "/admin/blogs", icon: <PencilIcon /> },
          { name: "Blog Categories", path: "/admin/blogs/categories", icon: <FolderIcon /> },
        ],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        icon: <AlertIcon />,
        name: "Notifications",
        path: "/admin/notifications",
        permissionCode: PermissionCode.NOTIFICATIONS_READ,
      },
      {
        icon: <PaperPlaneIcon />,
        name: "Emails",
        path: "/admin/emails",
        permissionCode: PermissionCode.EMAILS_READ,
      },
      {
        icon: <DocsIcon />,
        name: "Audit Logs",
        path: "/admin/audit-logs",
        permissionCode: PermissionCode.AUDIT_READ,
      },
      {
        icon: <UserIcon />,
        name: "Demo Leads",
        path: "/admin/demo-leads",
        badge: "Real Admin",
        realAdminOnly: true,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        icon: <PlugInIcon />,
        name: "Settings",
        permissionCode: PermissionCode.SETTINGS_READ,
        subItems: [
          { name: "General", path: "/admin/settings/general", icon: <PlugInIcon /> },
          { name: "Languages", path: "/admin/settings/languages", icon: <FileIcon /> },
          { name: "Contact & Social", path: "/admin/settings/contact", icon: <UserCircleIcon />, permissionCode: PermissionCode.SETTINGS_MANAGE_SITE },
          { name: "Currencies", path: "/admin/settings/currencies", icon: <DollarLineIcon />, permissionCode: PermissionCode.SETTINGS_MANAGE_CURRENCIES },
        ],
      },
    ],
  },
];

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Settings,
  User,
  BarChart3,
  LogOut,
  MessageSquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { ChatItem } from "@/components/chat-item";
import { useAuth } from "@/hooks/use-auth";
import { useChats } from "@/hooks/use-chats";
import type { AssetSelection } from "@/components/sidebar-asset-tree";

interface AppSidebarProps {
  onNewChat?: () => void;
  onSelectAsset?: (sel: AssetSelection) => void;
}

export function AppSidebar({ onNewChat, onSelectAsset }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { chats, activeChatId, newChat, openChat, deleteChat } = useChats();
  const currentPath = location.pathname;

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  const handleNewChat = () => {
    newChat();
    onNewChat?.();
    if (currentPath !== "/chat") navigate({ to: "/chat" });
  };

  const handleOpen = (id: string) => {
    openChat(id);
    if (currentPath !== "/chat") navigate({ to: "/chat" });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <BarChart3 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-foreground">Caritas</span>
            <span className="text-xs text-muted-foreground">{t("chat.title")}</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.chats")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleNewChat}
                  className="text-primary font-medium cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t("sidebar.newChat")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {chats.length === 0 ? (
              <div className="px-3 py-4 text-center group-data-[collapsible=icon]:hidden">
                <MessageSquare className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
                <p className="text-xs font-medium text-muted-foreground">
                  {t("sidebar.noChats")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                  {t("sidebar.startConversation")}
                </p>
              </div>
            ) : (
              <div className="mt-1 space-y-0.5 px-1 group-data-[collapsible=icon]:hidden">
                {chats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    onOpen={() => handleOpen(chat.id)}
                    onDelete={() => deleteChat(chat.id)}
                    onSelectAsset={(sel) => {
                      // Make sure the chat is active when viewing its asset
                      if (chat.id !== activeChatId) handleOpen(chat.id);
                      onSelectAsset?.(sel);
                    }}
                  />
                ))}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={currentPath === "/profile"}>
              <Link to="/profile">
                <User className="h-4 w-4" />
                <span>{t("sidebar.profile")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={currentPath === "/settings"}>
              <Link to="/settings">
                <Settings className="h-4 w-4" />
                <span>{t("sidebar.settings")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="cursor-pointer">
              <LogOut className="h-4 w-4" />
              <span>{t("sidebar.logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Notification {
  id: number;
  type: 'lead' | 'deal' | 'contract' | 'system' | 'task';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: 'lead',
      title: 'New Lead Added',
      description: 'John Smith inquired about the property on Oak Street',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      read: false,
    },
    {
      id: 2,
      type: 'contract',
      title: 'Contract Pending Signature',
      description: 'The purchase agreement for 123 Main St is ready for your signature',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      read: false,
    },
    {
      id: 3,
      type: 'deal',
      title: 'Deal Status Updated',
      description: 'Your offer on Maple Avenue has been accepted',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      read: true,
    },
  ]);

  const handleMarkAsRead = (id: number) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    toast.success('Marked as read');
  };

  const handleDelete = (id: number) => {
    setNotifications(notifications.filter(n => n.id !== id));
    toast.success('Notification deleted');
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const handleClearAll = () => {
    setNotifications([]);
    toast.success('All notifications cleared');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'lead':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'contract':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'deal':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'task':
        return <Bell className="w-5 h-5 text-purple-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleMarkAllAsRead}
                data-testid="button-mark-all-read"
              >
                Mark all as read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleClearAll}
                className="text-destructive hover:text-destructive"
                data-testid="button-clear-all"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="w-12 h-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground">
                  You'll get notifications about leads, contracts, and deals here
                </p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`transition-all ${!notification.read ? 'border-primary/50 bg-primary/5' : ''}`}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4 items-start">
                    <div className="mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-sm leading-tight">
                            {notification.title}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {notification.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatTime(notification.timestamp)}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkAsRead(notification.id)}
                              data-testid={`button-mark-read-${notification.id}`}
                              className="h-8 w-8 p-0"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(notification.id)}
                            data-testid={`button-delete-notif-${notification.id}`}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {notification.type}
                        </Badge>
                        {!notification.read && (
                          <Badge className="bg-primary text-white text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

import React, { useState, useEffect } from 'react';
import { Check, X, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface Notification {
  id: string;
  type: 'connection_request' | 'message' | 'general' | 'mention' | 'group_invite';
  content: string;
  is_read: boolean;
  created_at: string;
  data?: {
    requester_id?: string;
    requester_email?: string;
    connection_id?: string;
  };
}

interface NotificationPanelProps {
  onNotificationCountChange: (count: number) => void;
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onNotificationCountChange, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Subscribe to real-time notifications
    const subscription = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchNotifications)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    
    // Update notification count
    const unreadCount = data?.filter(n => !n.is_read).length || 0;
    onNotificationCountChange(unreadCount);
    
    setLoading(false);
  };

  const handleAcceptConnection = async (notification: Notification) => {
    if (!notification.data?.requester_id) return;

    try {
      // Find the connection by requester and receiver IDs
      const { data: connection, error: findError } = await supabase
        .from('connections')
        .select('id')
        .eq('requester_id', notification.data.requester_id)
        .eq('receiver_id', user?.id)
        .single();

      if (findError || !connection) {
        console.error('Error finding connection:', findError);
        toast.error('Connection not found');
        return;
      }

      const { error } = await supabase
        .from('connections')
        .update({ status: 'accepted' })
        .eq('id', connection.id);

      if (error) throw error;

      // Mark notification as read
      await markAsRead(notification.id);
      
      // Refresh notifications to update UI
      await fetchNotifications();

      toast.success('Connection request accepted!');
    } catch (error) {
      console.error('Error accepting connection:', error);
      toast.error('Failed to accept connection request');
    }
  };

  const handleRejectConnection = async (notification: Notification) => {
    if (!notification.data?.requester_id) return;

    try {
      // Find the connection by requester and receiver IDs
      const { data: connection, error: findError } = await supabase
        .from('connections')
        .select('id')
        .eq('requester_id', notification.data.requester_id)
        .eq('receiver_id', user?.id)
        .single();

      if (findError || !connection) {
        console.error('Error finding connection:', findError);
        toast.error('Connection not found');
        return;
      }

      const { error } = await supabase
        .from('connections')
        .update({ status: 'rejected' })
        .eq('id', connection.id);

      if (error) throw error;

      // Mark notification as read
      await markAsRead(notification.id);
      
      // Refresh notifications to update UI
      await fetchNotifications();

      toast.success('Connection request rejected');
    } catch (error) {
      console.error('Error rejecting connection:', error);
      toast.error('Failed to reject connection request');
    }
  };

  const handleAcceptGroupInvite = async (notification: Notification) => {
    if (!notification.data?.group_id) return;

    try {
      // If it's an auto-added notification, just mark as read
      if (notification.data.auto_added) {
        await markAsRead(notification.id);
        toast.success('You have been added to the group!');
        return;
      }

      // Accept the group invitation
      const { data, error } = await supabase.rpc('accept_group_invitation', {
        p_group_id: notification.data.group_id,
        p_user_id: user?.id
      });

      if (error) throw error;

      if (data) {
        toast.success('Successfully joined the group!');
        await fetchNotifications();
      } else {
        toast.error('Failed to join group');
      }
    } catch (error) {
      console.error('Error accepting group invite:', error);
      toast.error('Failed to join group');
    }
  };

  const handleRejectGroupInvite = async (notification: Notification) => {
    if (!notification.data?.group_id) return;

    try {
      const { data, error } = await supabase.rpc('reject_group_invitation', {
        p_group_id: notification.data.group_id,
        p_user_id: user?.id
      });

      if (error) throw error;

      toast.success('Group invitation rejected');
      await fetchNotifications();
    } catch (error) {
      console.error('Error rejecting group invite:', error);
      toast.error('Failed to reject invitation');
    }
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  };

  const deleteNotification = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const clearAllNotifications = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Failed to clear notifications');
    } else {
      toast.success('All notifications cleared');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
            <div className="flex items-center space-x-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm mt-2">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border ${
                    notification.is_read
                      ? 'bg-white border-gray-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 mb-2">
                        {notification.content}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(notification.created_at))} ago
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="text-gray-400 hover:text-red-600 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {notification.type === 'connection_request' && !notification.is_read && (
                    <div className="flex items-center space-x-2 mt-3">
                      <button
                        onClick={() => handleAcceptConnection(notification)}
                        className="flex items-center px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleRejectConnection(notification)}
                        className="flex items-center px-3 py-1 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </button>
                    </div>
                  )}

                  {notification.type === 'mention' && !notification.is_read && (
                    <div className="flex items-center space-x-2 mt-3">
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="flex items-center px-3 py-1 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        View Message
                      </button>
                    </div>
                  )}

                  {notification.type === 'group_invite' && !notification.is_read && (
                    <div className="flex items-center space-x-2 mt-3">
                      <button
                        onClick={() => {
                          handleAcceptGroupInvite(notification);
                        }}
                        className="flex items-center px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
                      >
                        {notification.data?.auto_added ? 'View Group' : 'Accept Invite'}
                      </button>
                      {!notification.data?.auto_added && (
                        <button
                          onClick={() => handleRejectGroupInvite(notification)}
                          className="flex items-center px-3 py-1 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationPanel;
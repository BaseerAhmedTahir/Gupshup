import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Settings, LogOut, UserPlus, Bell, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import ContactList from '../Chat/ContactList';
import NotificationPanel from '../Notifications/NotificationPanel';
import AddContactModal from '../Contacts/AddContactModal';
import ProfileModal from '../Profile/ProfileModal';
import CreateGroupModal from '../Groups/CreateGroupModal';

interface SidebarProps {
  selectedContact: string | null;
  selectedGroup: string | null;
  onContactSelect: (contactId: string) => void;
  onGroupSelect: (groupId: string) => void;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  created_at: string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  selectedContact, 
  selectedGroup, 
  onContactSelect, 
  onGroupSelect 
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'groups'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!user) return;

    fetchGroups();

    const subscription = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchNotificationCount();
      })
      .subscribe();

    fetchNotificationCount();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const fetchGroups = async () => {
    if (!user) return;

    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from<Group>('groups')
        .select('id, name, description, avatar_url, created_at')
        .order('created_at', { ascending: false });

      if (groupsError) {
        console.error('Error fetching groups:', groupsError);
        setGroups([]);
        return;
      }

      const userGroups: Group[] = [];

      for (const group of groupsData || []) {
        const { data: membership } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', group.id)
          .eq('user_id', user.id)
          .single();

        if (membership) userGroups.push(group);
      }

      setGroups(userGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroups([]);
    }
  };

  const fetchNotificationCount = async () => {
    if (!user) return;

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotificationCount(count || 0);
  };

  const tabs = [
    { id: 'chats', label: 'Chats', icon: MessageCircle },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'groups', label: 'Groups', icon: Users },
  ];

  const handleAddAction = () => {
    if (activeTab === 'contacts') {
      setShowAddContact(true);
    } else if (activeTab === 'groups') {
      setShowCreateGroup(true);
    }
  };

  return (
    <div className="w-full lg:w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Gupshup</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowNotificationsModal(true)}
              className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <button
              onClick={signOut}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'chats' | 'contacts' | 'groups')}
              className={`flex-1 flex items-center justify-center py-3 px-4 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab-specific action buttons */}
        {(activeTab === 'contacts' || activeTab === 'groups') && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <button
              onClick={handleAddAction}
              className="w-full flex items-center justify-center py-2 px-4 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {activeTab === 'groups' ? 'Create New Group' : 'Add New Contact'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chats' && (
          <ContactList
            searchQuery={searchQuery}
            selectedContact={selectedContact}
            onContactSelect={onContactSelect}
            showOnlyConnected={true}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactList
            searchQuery={searchQuery}
            selectedContact={selectedContact}
            onContactSelect={onContactSelect}
            showOnlyConnected={false}
          />
        )}
        {activeTab === 'groups' && (
          <div className="flex-1 overflow-y-auto chat-scrollbar">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Users className="w-12 h-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">No groups yet</p>
                <p className="text-sm mt-2">Create a group to start chatting</p>
              </div>
            ) : (
              groups
                .filter(group => 
                  group.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(group => (
                  <div
                    key={group.id}
                    onClick={() => onGroupSelect(group.id)}
                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedGroup === group.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                        {group.avatar_url ? (
                          <img
                            src={group.avatar_url}
                            alt={group.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Users className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {group.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {group.description || 'Group chat'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div 
          className="flex items-center cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2"
          onClick={() => setShowProfile(true)}
        >
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Profile"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold text-blue-600">
                {user?.user_metadata?.display_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {user?.user_metadata?.display_name || user?.email}
            </p>
            <p className="text-xs text-green-600">Online</p>
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <AddContactModal
          onClose={() => setShowAddContact(false)}
          onSuccess={() => {
            setShowAddContact(false);
          }}
        />
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onSuccess={(groupId) => {
            setShowCreateGroup(false);
            fetchGroups();
            onGroupSelect(groupId);
          }}
        />
      )}

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <NotificationPanel
          onNotificationCountChange={setNotificationCount}
          onClose={() => setShowNotificationsModal(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;

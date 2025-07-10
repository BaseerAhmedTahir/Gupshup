import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Circle, User, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import UserProfileModal from '../Profile/UserProfileModal';

interface Contact {
  id: string;
  email: string;
  display_name: string;
  status: 'online' | 'offline' | 'away';
  last_active: string;
  lastMessage?: {
    content: string;
    timestamp: string;
    read: boolean;
  };
  unreadCount?: number;
}

interface ContactListProps {
  searchQuery: string;
  selectedContact: string | null;
  onContactSelect: (contactId: string) => void;
  showOnlyConnected?: boolean;
}

const ContactList: React.FC<ContactListProps> = ({
  searchQuery,
  selectedContact,
  onContactSelect,
  showOnlyConnected = false,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserProfile, setShowUserProfile] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    fetchContacts();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('contacts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'connections',
      }, fetchContacts)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
      }, fetchContacts)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
      }, fetchContacts)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, showOnlyConnected]);

  const fetchContacts = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('connections')
        .select(`
          *,
          requester:profiles!connections_requester_id_fkey(id, email, display_name, status, last_active),
          receiver:profiles!connections_receiver_id_fkey(id, email, display_name, status, last_active)
        `)
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (showOnlyConnected) {
        query = query.eq('status', 'accepted');
      }

      const { data: connections, error } = await query;

      if (error) {
        console.error('Error fetching contacts:', error);
        return;
      }

      const contactPromises = connections.map(async (connection) => {
        const isRequester = connection.requester_id === user.id;
        const contact = isRequester ? connection.receiver : connection.requester;

        // Fetch last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, timestamp, read')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${contact.id}),and(sender_id.eq.${contact.id},receiver_id.eq.${user.id})`)
          .order('timestamp', { ascending: false })
          .limit(1);

        // Fetch unread count
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', contact.id)
          .eq('receiver_id', user.id)
          .eq('read', false);

        return {
          ...contact,
          lastMessage: lastMessage?.[0],
          unreadCount: unreadCount || 0,
        };
      });

      const contactsData = await Promise.all(contactPromises);
      
      // Filter by search query
      const filteredContacts = contactsData.filter((contact) =>
        contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.display_name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      // Sort by last message timestamp or last active
      filteredContacts.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp || a.last_active;
        const bTime = b.lastMessage?.timestamp || b.last_active;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setContacts(filteredContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'away':
        return 'text-yellow-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = (contact: Contact) => {
    if (contact.status === 'online') return 'Online';
    if (contact.status === 'away') return 'Away';
    return `Last seen ${formatDistanceToNow(new Date(contact.last_active))} ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 p-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-lg font-semibold text-gray-700">No contacts found</p>
        <p className="text-sm mt-2 text-gray-500">
          {showOnlyConnected
            ? 'Start by adding some contacts'
            : 'No contacts match your search'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all hover-lift animate-slide-in-up ${
              selectedContact === contact.id ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' : ''
            }`}
          >
            <div className="flex items-center" onClick={() => onContactSelect(contact.id)}>
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center shadow-md">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={contact.display_name || contact.email}
                      className="w-full h-full rounded-full object-cover border-2 border-white"
                    />
                  ) : (
                    <span className="text-lg font-bold text-gray-600">
                      {contact.email.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <div className={`w-4 h-4 rounded-full ${
                    contact.status === 'online' ? 'status-online' : 
                    contact.status === 'away' ? 'status-away' : 'status-offline'
                  }`}></div>
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {contact.display_name || contact.email}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowUserProfile(contact.id);
                      }}
                      className="text-gray-400 hover:text-blue-600 transition-colors hover-lift flex-shrink-0"
                      title="View Profile"
                    >
                      <User className="w-3 h-3" />
                    </button>
                  </div>
                  {contact.lastMessage && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatDistanceToNow(new Date(contact.lastMessage.timestamp))} ago
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500 truncate">
                    {contact.lastMessage?.content || (contact.display_name ? contact.email : getStatusText(contact))}
                  </p>
                  {contact.unreadCount && contact.unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-1 ml-2 text-xs font-bold leading-none text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-md flex-shrink-0">
                      {contact.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfileModal
          userId={showUserProfile}
          onClose={() => setShowUserProfile(null)}
          onStartChat={(userId) => {
            onContactSelect(userId);
            setShowUserProfile(null);
          }}
        />
      )}
    </div>
  );
};

export default ContactList;

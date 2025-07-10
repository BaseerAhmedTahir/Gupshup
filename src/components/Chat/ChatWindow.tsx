import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, Trash2, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import FileUpload from './FileUpload';
import EmojiPicker from './EmojiPicker';
import UserProfileModal from '../Profile/UserProfileModal';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  read: boolean;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  delivered_at?: string;
  read_at?: string;
  deleted_for_everyone?: boolean;
}

interface Contact {
  id: string;
  email: string;
  display_name: string;
  status: 'online' | 'offline' | 'away';
  last_active: string;
}

interface ChatWindowProps {
  contactId: string;
}

interface Connection {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ contactId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeenMessageRef = useRef<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !contactId) return;

    fetchContact();
    fetchConnection();
    fetchMessages();

    // Subscribe to real-time messages
    const messagesSubscription = supabase
      .channel('messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `or(and(sender_id.eq.${user.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user.id}))`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
        scrollToBottom();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `or(and(sender_id.eq.${user.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user.id}))`,
      }, (payload) => {
        setMessages(prev => prev.map(msg => 
          msg.id === payload.new.id ? payload.new as Message : msg
        ));
      })
      .subscribe();

    // Subscribe to typing indicators
    const typingSubscription = supabase
      .channel(`typing_${contactId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId === contactId) {
          setOtherUserTyping(payload.payload.typing);
        }
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      typingSubscription.unsubscribe();
    };
  }, [user, contactId]);

  // Mark messages as delivered when they come into view
  useEffect(() => {
    if (!user || !contactId || messages.length === 0) return;

    const undeliveredMessages = messages.filter(
      msg => msg.sender_id === contactId && !msg.delivered_at
    );

    if (undeliveredMessages.length > 0) {
      markMessagesAsDelivered();
    }
  }, [messages, user, contactId]);

  // Mark messages as read when user is viewing the chat
  useEffect(() => {
    if (!user || !contactId || messages.length === 0) return;

    const unreadMessages = messages.filter(
      msg => msg.sender_id === contactId && !msg.read_at
    );

    if (unreadMessages.length > 0) {
      const timer = setTimeout(() => {
        markMessagesAsRead();
      }, 1000); // Mark as read after 1 second of viewing

      return () => clearTimeout(timer);
    }
  }, [messages, user, contactId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchContact = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', contactId)
      .single();

    if (error) {
      console.error('Error fetching contact:', error);
      return;
    }

    setContact(data);
  };

  const fetchConnection = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .or(`and(requester_id.eq.${user.id},receiver_id.eq.${contactId}),and(requester_id.eq.${contactId},receiver_id.eq.${user.id})`)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching connection:', error);
      return;
    }

    setConnection(data);
  };

  const fetchMessages = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user.id})`)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    setMessages(data || []);
    setLoading(false);
  };

  const markMessagesAsDelivered = async () => {
    if (!user) return;

    try {
      await supabase.rpc('mark_messages_delivered', {
        receiver_user_id: user.id,
        sender_user_id: contactId
      });
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!user) return;

    try {
      await supabase.rpc('mark_messages_read', {
        receiver_user_id: user.id,
        sender_user_id: contactId
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;

    const tempMessage = {
      id: `temp-${Date.now()}`,
      sender_id: user.id,
      receiver_id: contactId,
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      type: 'text' as const,
      read: false,
    };

    setSending(true);
    setIsTyping(false);
    
    // Optimistically add the message to the UI
    setMessages(prev => [...prev, tempMessage]);
    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: contactId,
          content: messageContent,
          type: 'text',
        })
        .select()
        .single();

      if (error) throw error;

      // Replace the temporary message with the real one
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? data : msg
      ));
      
      // Stop typing indicator
      supabase.channel(`typing_${contactId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user.id, typing: false },
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      // Restore the message content
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (value: string) => {
    setNewMessage(value);

    if (!isTyping && value.trim()) {
      setIsTyping(true);
      supabase.channel(`typing_${contactId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user?.id, typing: true },
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      supabase.channel(`typing_${contactId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: user?.id, typing: false },
      });
    }, 1000);
  };

  const handleFileUpload = async (file: File) => {
    if (!user) return;

    // Validate file size (15MB limit)
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size must be less than 15MB');
      return;
    }

    const tempMessage = {
      id: `temp-file-${Date.now()}`,
      sender_id: user.id,
      receiver_id: contactId,
      content: file.name,
      timestamp: new Date().toISOString(),
      type: file.type.startsWith('image/') ? 'image' as const : 'file' as const,
      read: false,
      file_url: URL.createObjectURL(file), // Temporary URL for preview
      file_name: file.name,
      file_size: file.size,
    };

    // Optimistically add the file message to the UI
    setMessages(prev => [...prev, tempMessage]);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('messages')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(fileName);

      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: contactId,
          content: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
        })
        .select()
        .single();

      if (messageError) throw messageError;

      // Replace the temporary message with the real one
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? messageData : msg
      ));
      
    } catch (error) {
      console.error('Error uploading file:', error);
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleDeleteMessage = async (messageId: string, deleteForEveryone: boolean) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('delete_message_for_user', {
        message_id: messageId,
        user_id: user.id,
        delete_for_everyone: deleteForEveryone
      });

      if (error) throw error;

      if (!data) {
        throw new Error('Failed to delete message');
      }

      // Update local state
      if (deleteForEveryone) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, deleted_for_everyone: true, content: 'This message was deleted' }
            : msg
        ));
      } else {
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleClearConversation = async () => {
    if (!user || !contactId) return;

    const confirmed = window.confirm(
      'Are you sure you want to clear this entire conversation?\n\n' +
      '• This will delete all messages for you only\n' +
      '• The other person will still see the conversation\n' +
      '• This action cannot be undone\n\n' +
      'Do you want to continue?'
    );
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc('clear_conversation_for_user', {
        user_id: user.id,
        other_user_id: contactId
      });

      if (error) throw error;

      // Clear messages from local state
      setMessages([]);
      toast.success('Conversation cleared');
    } catch (error) {
      console.error('Error clearing conversation:', error);
      toast.error('Failed to clear conversation');
    }
  };

  const showCallFeatureMessage = () => {
    toast.success('Voice and video calls coming soon!');
  };

  const getStatusText = () => {
    if (!contact) return '';
    
    if (contact.status === 'online') return 'Online';
    if (contact.status === 'away') return 'Away';
    return `Last seen ${formatDistanceToNow(new Date(contact.last_active))} ago`;
  };

  const getConnectionStatus = () => {
    if (!connection) return 'not_connected';
    return connection.status;
  };

  const isConnectionAccepted = () => {
    return getConnectionStatus() === 'accepted';
  };

  const getConnectionMessage = () => {
    const status = getConnectionStatus();
    if (status === 'pending') {
      if (connection?.requester_id === user?.id) {
        return 'Connection request sent. Waiting for acceptance.';
      } else {
        return 'You have a pending connection request from this user.';
      }
    }
    if (status === 'rejected') {
      return 'Connection request was declined.';
    }
    if (status === 'not_connected') {
      return 'You need to connect with this user to start messaging.';
    }
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Contact not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 shadow-sm">
        <div 
          className="flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg p-2 -m-2 transition-all hover-lift flex-1 min-w-0"
          onClick={() => setShowUserProfile(true)}
        >
          <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
            {contact.avatar_url ? (
              <img
                src={contact.avatar_url}
                alt={contact.display_name || contact.email}
                className="w-full h-full rounded-full object-cover border-2 border-white"
              />
            ) : (
              <span className="text-xs lg:text-sm font-bold text-gray-600">
                {contact.email.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="ml-3 min-w-0 flex-1">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900 truncate">
              {contact.display_name || contact.email}
            </h3>
            <p className="text-xs lg:text-sm text-gray-500 font-medium truncate">{getStatusText()}</p>
          </div>
          <User className="w-4 h-4 ml-2 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0" />
        </div>
        <div className="flex items-center space-x-1 lg:space-x-2 ml-2">
          <button 
            onClick={showCallFeatureMessage}
            className="p-1.5 lg:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover-lift"
          >
            <Phone className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
          <button 
            onClick={showCallFeatureMessage}
            className="p-1.5 lg:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover-lift"
          >
            <Video className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
          <button 
            onClick={handleClearConversation}
            className="p-1.5 lg:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all hover-lift"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
          <button className="p-1.5 lg:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all hover-lift">
            <MoreVertical className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      {isConnectionAccepted() ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white scrollbar-thin">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === user?.id}
              onDelete={handleDeleteMessage}
            />
          ))}
          
          {otherUserTyping && (
            <TypingIndicator username={contact.email} />
          )}
          
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={contact.display_name || contact.email}
                  className="w-full h-full rounded-full object-cover border-2 border-white"
                />
              ) : (
                <span className="text-xl font-bold text-gray-600">
                  {contact.email.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {contact.display_name || contact.email}
            </h3>
            <p className="text-gray-600 mb-4">{getConnectionMessage()}</p>
            <p className="text-sm text-gray-500">
              Connect with this user to start messaging.
            </p>
          </div>
        </div>
      )}

      {/* Message Input */}
      {isConnectionAccepted() && (
        <div className="p-4 border-t border-gray-200 bg-gradient-to-r from-white to-gray-50 shadow-sm">
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <FileUpload onFileSelect={handleFileUpload} />
            
            <div className="flex-1 relative">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => handleTyping(e.target.value)}
                placeholder="Message..."
                className="w-full px-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all"
                disabled={sending}
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <EmojiPicker onEmojiSelect={handleEmojiSelect} />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg hover-lift"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}
      
      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfileModal
          userId={contactId}
          onClose={() => setShowUserProfile(false)}
          onStartChat={() => {}} // Already in chat
        />
      )}
    </div>
  );
};

export default ChatWindow;

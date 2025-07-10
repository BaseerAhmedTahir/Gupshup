import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, Users, UserPlus, Settings, User, LogOut, Edit2, Trash2, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import GroupMessageBubble from './GroupMessageBubble';
import FileUpload from '../Chat/FileUpload';
import EmojiPicker from '../Chat/EmojiPicker';
import UserProfileModal from '../Profile/UserProfileModal';
import AddMemberModal from './AddMemberModal';
import GroupSettingsModal from './GroupSettingsModal';
import toast from 'react-hot-toast';

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  mentioned_users: string[];
  deleted_for_users: string[];
  delivered_at?: string;
  read_at?: string;
  sender: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface GroupMember {
  id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface Group {
  id: string;
  name: string;
  description: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
}

interface GroupChatWindowProps {
  groupId: string;
}

const GroupChatWindow: React.FC<GroupChatWindowProps> = ({ groupId }) => {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUserProfile, setShowUserProfile] = useState<string | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showTransferAdmin, setShowTransferAdmin] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const isAdmin = user && group && (user.id === group.created_by || members.find(m => m.user_id === user.id)?.role === 'admin');
  const currentUserMember = members.find(m => m.user_id === user?.id);

  useEffect(() => {
    if (!user || !groupId) return;

    fetchGroup();
    fetchMembers();
    fetchMessages();

    // Mark messages as delivered when component loads
    if (user && groupId) {
      supabase.rpc('mark_group_messages_delivered', {
        group_id: groupId,
        user_id: user.id
      });
    }

    // Subscribe to real-time messages
    const messagesSubscription = supabase
      .channel(`group_messages_${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        // Fetch sender info
        const { data: sender } = await supabase
          .from('profiles')
          .select('id, email, display_name, avatar_url')
          .eq('id', payload.new.sender_id)
          .single();

        if (sender) {
          const newMessage = {
            ...payload.new,
            sender
          } as GroupMessage;
          
          setMessages(prev => [...prev, newMessage]);
          scrollToBottom();
        }
      })
      .subscribe();

    // Subscribe to group updates
    const groupSubscription = supabase
      .channel(`group_${groupId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'groups',
        filter: `id=eq.${groupId}`,
      }, (payload) => {
        setGroup(prev => prev ? { ...prev, ...payload.new } : null);
      })
      .subscribe();

    // Subscribe to member changes
    const membersSubscription = supabase
      .channel(`group_members_${groupId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_members',
        filter: `group_id=eq.${groupId}`,
      }, () => {
        fetchMembers();
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      groupSubscription.unsubscribe();
      membersSubscription.unsubscribe();
    };
  }, [user, groupId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchGroup = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, description, avatar_url, created_by, created_at')
        .eq('id', groupId)
        .single();

      if (error) {
        console.error('Error fetching group:', error);
        return;
      }

      setGroup(data);
    } catch (error) {
      console.error('Error fetching group:', error);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          role,
          joined_at,
          user:profiles(id, email, display_name, avatar_url)
        `)
        .eq('group_id', groupId);

      if (error) {
        console.error('Error fetching members:', error);
        return;
      }

      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchMessages = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('group_messages')
      .select(`
        id,
        group_id,
        sender_id,
        content,
        timestamp,
        type,
        file_url,
        file_name,
        file_size,
        mentioned_users,
        deleted_for_users,
        delivered_at,
        read_at,
        sender:profiles(id, email, display_name, avatar_url)
      `)
      .eq('group_id', groupId)
      .not('deleted_for_users', 'cs', `{${user.id}}`)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    setMessages(data || []);
    setLoading(false);

    // Mark messages as read after fetching
    if (user && groupId) {
      setTimeout(() => {
        supabase.rpc('mark_group_messages_read', {
          group_id: groupId,
          user_id: user.id
        });
      }, 1000);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const parseMentions = (content: string): { content: string; mentions: string[] } => {
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      // Find user by display name or email
      const mentionedMember = members.find(member => 
        member.user.display_name.toLowerCase() === username.toLowerCase() ||
        member.user.email.toLowerCase().startsWith(username.toLowerCase()) ||
        member.user.email.split('@')[0].toLowerCase() === username.toLowerCase()
      );
      
      if (mentionedMember && !mentions.includes(mentionedMember.user_id)) {
        mentions.push(mentionedMember.user_id);
      }
    }

    return { content, mentions };
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;

    const { content, mentions } = parseMentions(newMessage.trim());

    setSending(true);
    const messageContent = content;
    setNewMessage('');

    try {
      // Insert message directly to get immediate feedback
      const { data: messageData, error: insertError } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: messageContent,
          type: 'text',
          mentioned_users: mentions
        })
        .select(`
          id,
          group_id,
          sender_id,
          content,
          timestamp,
          type,
          file_url,
          file_name,
          file_size,
          mentioned_users,
          deleted_for_users
        `)
        .single();

      if (insertError) throw insertError;

      // Add sender info and update local state immediately
      const newMsg = {
        ...messageData,
        sender: {
          id: user.id,
          email: user.email || '',
          display_name: user.user_metadata?.display_name || user.email || '',
          avatar_url: user.user_metadata?.avatar_url
        }
      } as GroupMessage;

      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();

      // Handle mentions if any
      if (mentions.length > 0) {
        await supabase.rpc('send_group_message_with_mentions', {
          p_group_id: groupId,
          p_sender_id: user.id,
          p_content: messageContent,
          p_type: 'text',
          p_mentioned_users: mentions
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!user) return;

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size must be less than 15MB');
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('messages')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('messages')
        .getPublicUrl(fileName);

      const { error: messageError } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
        });

      if (messageError) throw messageError;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleDeleteMessage = async (messageId: string, deleteForEveryone: boolean = false) => {
    if (!user) return;

    try {
      if (deleteForEveryone) {
        const { data, error } = await supabase.rpc('delete_group_message_for_everyone', {
          message_id: messageId,
          user_id: user.id
        });

        if (error) throw error;

        if (data) {
          setMessages(prev => prev.filter(msg => msg.id !== messageId));
          toast.success('Message deleted for everyone');
        } else {
          toast.error('Cannot delete message (may be too old or not yours)');
        }
      } else {
        const { data, error } = await supabase.rpc('delete_group_message_for_user', {
          message_id: messageId,
          user_id: user.id
        });

        if (error) throw error;

        setMessages(prev => prev.filter(msg => msg.id !== messageId));
        toast.success('Message deleted for you');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleTransferAdmin = async (newAdminId: string) => {
    if (!user || !group || user.id !== group.created_by) return;

    try {
      // Update group creator
      const { error: groupError } = await supabase
        .from('groups')
        .update({ created_by: newAdminId })
        .eq('id', groupId);

      if (groupError) throw groupError;

      // Update member roles
      await supabase
        .from('group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      await supabase
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('user_id', newAdminId);

      const newAdmin = members.find(m => m.user_id === newAdminId);
      
      // Send system message
      await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: '00000000-0000-0000-0000-000000000000',
          content: `${user.user_metadata?.display_name || user.email} transferred admin rights to ${newAdmin?.user.display_name || newAdmin?.user.email}`,
          type: 'text'
        });

      setShowTransferAdmin(false);
      toast.success('Admin rights transferred');
      fetchGroup();
      fetchMembers();
    } catch (error) {
      console.error('Error transferring admin:', error);
      toast.error('Failed to transfer admin rights');
    }
  };

  const handleDeleteGroup = async () => {
    if (!user || !group || user.id !== group.created_by) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this group?\n\n' +
      'This action cannot be undone. All messages and data will be permanently deleted.'
    );
    
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      toast.success('Group deleted successfully');
      window.history.back();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !groupId) return;

    const isGroupAdmin = user.id === group?.created_by;
    const otherMembers = members.filter(m => m.user_id !== user.id);

    if (isGroupAdmin && otherMembers.length > 0) {
      setShowTransferAdmin(true);
      return;
    }

    const confirmed = window.confirm(
      isGroupAdmin 
        ? 'As the admin, leaving will delete the group for everyone. Are you sure?'
        : 'Are you sure you want to leave this group?\n\nYou will no longer receive messages from this group and will need to be re-invited to join again.'
    );
    
    if (!confirmed) return;

    try {
      if (isGroupAdmin && otherMembers.length === 0) {
        // Delete the group if admin is the only member
        await handleDeleteGroup();
        return;
      }

      // Send leave message before leaving
      await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: '00000000-0000-0000-0000-000000000000',
          content: `${user.user_metadata?.display_name || user.email} left the group`,
          type: 'text'
        });

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Left group successfully');
      // Navigate back to groups list or main chat
      window.location.href = '/';
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Failed to leave group');
    }
  };

  const showCallFeatureMessage = () => {
    toast.success('Voice and video calls coming soon!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Group not found</p>
      </div>
    );
  }

  const otherMembers = members.filter(m => m.user_id !== user?.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 shadow-sm">
        <div className="flex items-center">
          <div className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-100 to-indigo-200 flex items-center justify-center shadow-md">
              {group.avatar_url ? (
                <img
                  src={group.avatar_url}
                  alt={group.name}
                  className="w-full h-full object-cover border-2 border-white"
                />
              ) : (
                <Users className="w-5 h-5 text-purple-600" />
              )}
            </div>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
            <p className="text-sm text-gray-500 font-medium">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowAddMember(true)}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover-lift"
            title="Add Members"
          >
            <UserPlus className="w-5 h-5" />
          </button>
          <button 
            onClick={showCallFeatureMessage}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover-lift"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            onClick={showCallFeatureMessage}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover-lift"
          >
            <Video className="w-5 h-5" />
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowGroupMenu(!showGroupMenu)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all hover-lift"
              title="Group Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            
            {showGroupMenu && (
              <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-lg shadow-elegant-lg py-1 z-10 min-w-[150px] animate-fade-in-scale">
                <button
                  onClick={() => {
                    setShowGroupSettings(true);
                    setShowGroupMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center transition-colors"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Group Settings
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      handleDeleteGroup();
                      setShowGroupMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Group
                  </button>
                )}
                <button
                  onClick={() => {
                    handleLeaveGroup();
                    setShowGroupMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Group
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Admin Modal */}
      {showTransferAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Transfer Admin Rights</h3>
            <p className="text-gray-600 mb-4">
              As the group admin, you need to transfer admin rights to another member before leaving, or delete the group.
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {otherMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => handleTransferAdmin(member.user_id)}
                  className="w-full flex items-center p-2 hover:bg-gray-100 rounded-lg text-left"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                    {member.user.avatar_url ? (
                      <img
                        src={member.user.avatar_url}
                        alt={member.user.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-600">
                        {member.user.email.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="ml-2 text-sm">
                    {member.user.display_name || member.user.email}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleDeleteGroup}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete Group
              </button>
              <button
                onClick={() => setShowTransferAdmin(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white scrollbar-thin">
        {messages.map((message) => (
          <GroupMessageBubble
            key={message.id}
            message={message}
            isOwn={message.sender_id === user?.id}
            members={members}
            onDelete={handleDeleteMessage}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-200 bg-gradient-to-r from-white to-gray-50 shadow-sm">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <FileUpload onFileSelect={handleFileUpload} />
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message... (@mention)"
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
      
      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfileModal
          userId={showUserProfile}
          onClose={() => setShowUserProfile(null)}
          onStartChat={() => {}} // In group chat context
        />
      )}
      
      {/* Add Member Modal */}
      {showAddMember && (
        <AddMemberModal
          groupId={groupId}
          groupName={group.name}
          onClose={() => setShowAddMember(false)}
          onSuccess={() => {
            setShowAddMember(false);
            fetchMembers();
          }}
        />
      )}
      
      {/* Group Settings Modal */}
      {showGroupSettings && (
        <GroupSettingsModal
          group={group}
          onClose={() => setShowGroupSettings(false)}
          onUpdate={(updatedGroup) => {
            setGroup(updatedGroup);
            setShowGroupSettings(false);
          }}
        />
      )}
    </div>
  );
};

export default GroupChatWindow;
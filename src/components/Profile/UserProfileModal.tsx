import React, { useState, useEffect } from 'react';
import { X, User, Mail, Calendar, MessageCircle, UserPlus, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  status: 'online' | 'offline' | 'away';
  last_active: string;
  created_at: string;
}

interface Connection {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  requester_id: string;
  receiver_id: string;
}

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
  onStartChat?: (userId: string) => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ userId, onClose, onStartChat }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchUserProfile();
    fetchConnection();
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchConnection = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .or(`and(requester_id.eq.${user.id},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${user.id})`)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setConnection(data);
    } catch (error) {
      console.error('Error fetching connection:', error);
    }
  };

  const handleSendConnectionRequest = async () => {
    if (!user || !profile) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from('connections')
        .insert({
          requester_id: user.id,
          receiver_id: profile.id,
          status: 'pending',
        });

      if (error) throw error;

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          user_id: profile.id,
          type: 'connection_request',
          content: `${user.email} wants to connect with you`,
          data: {
            requester_id: user.id,
            requester_email: user.email,
          },
        });

      toast.success('Connection request sent!');
      fetchConnection();
    } catch (error) {
      console.error('Error sending connection request:', error);
      toast.error('Failed to send connection request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptConnection = async () => {
    if (!connection) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from('connections')
        .update({ status: 'accepted' })
        .eq('id', connection.id);

      if (error) throw error;

      toast.success('Connection accepted!');
      fetchConnection();
    } catch (error) {
      console.error('Error accepting connection:', error);
      toast.error('Failed to accept connection');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartChat = () => {
    if (onStartChat && profile) {
      onStartChat(profile.id);
      onClose();
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

  const getStatusText = () => {
    if (!profile) return '';
    
    if (profile.status === 'online') return 'Online';
    if (profile.status === 'away') return 'Away';
    return `Last seen ${formatDistanceToNow(new Date(profile.last_active))} ago`;
  };

  const getConnectionStatus = () => {
    if (!connection) return 'none';
    return connection.status;
  };

  const isOwnProfile = user?.id === userId;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="text-center">
            <p className="text-gray-500">User not found</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">User Profile</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Profile Picture and Basic Info */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || profile.email}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-gray-400" />
                )}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${
                profile.status === 'online' ? 'bg-green-500' : 
                profile.status === 'away' ? 'bg-yellow-500' : 'bg-gray-400'
              }`}>
                <div className="w-3 h-3 rounded-full bg-white"></div>
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-4">
              {profile.display_name || 'No display name'}
            </h3>
            
            <p className={`text-sm font-medium ${getStatusColor(profile.status)}`}>
              {getStatusText()}
            </p>
          </div>

          {/* User Details */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">Email</p>
                <p className="text-sm text-gray-600">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">Member since</p>
                <p className="text-sm text-gray-600">
                  {formatDistanceToNow(new Date(profile.created_at))} ago
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {!isOwnProfile && (
            <div className="space-y-3">
              {getConnectionStatus() === 'accepted' && (
                <button
                  onClick={handleStartChat}
                  className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Start Chat
                </button>
              )}

              {getConnectionStatus() === 'none' && (
                <button
                  onClick={handleSendConnectionRequest}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  {actionLoading ? 'Sending...' : 'Send Connection Request'}
                </button>
              )}

              {getConnectionStatus() === 'pending' && connection?.requester_id === user?.id && (
                <div className="w-full flex items-center justify-center px-4 py-3 bg-yellow-100 text-yellow-800 rounded-xl">
                  <UserPlus className="w-5 h-5 mr-2" />
                  Connection Request Sent
                </div>
              )}

              {getConnectionStatus() === 'pending' && connection?.receiver_id === user?.id && (
                <button
                  onClick={handleAcceptConnection}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <UserCheck className="w-5 h-5 mr-2" />
                  {actionLoading ? 'Accepting...' : 'Accept Connection Request'}
                </button>
              )}

              {getConnectionStatus() === 'accepted' && (
                <div className="w-full flex items-center justify-center px-4 py-3 bg-green-100 text-green-800 rounded-xl">
                  <UserCheck className="w-5 h-5 mr-2" />
                  Connected
                </div>
              )}

              {getConnectionStatus() === 'rejected' && (
                <div className="w-full flex items-center justify-center px-4 py-3 bg-red-100 text-red-800 rounded-xl">
                  Connection Rejected
                </div>
              )}
            </div>
          )}

          {isOwnProfile && (
            <div className="text-center text-gray-500">
              <p className="text-sm">This is your profile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
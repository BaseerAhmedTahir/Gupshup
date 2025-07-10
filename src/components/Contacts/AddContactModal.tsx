import React, { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface AddContactModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AddContactModal: React.FC<AddContactModalProps> = ({ onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (email === user?.email) {
      setError('You cannot add yourself as a contact');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to find the user in profiles table with a more robust approach
      const { data: existingUser, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (profileError) {
        console.error('Profile lookup error:', profileError);
        setError('Error looking up user. Please try again.');
        setLoading(false);
        return;
      }

      if (!existingUser) {
        setError('User not found. Please make sure they have created an account first.');
        setLoading(false);
        return;
      }

      const userProfile = existingUser;

      // Check if connection already exists
      const { data: existingConnection, error: connectionError } = await supabase
        .from('connections')
        .select('*')
        .or(`and(requester_id.eq.${user?.id},receiver_id.eq.${userProfile.id}),and(requester_id.eq.${userProfile.id},receiver_id.eq.${user?.id})`)
        .maybeSingle();

      if (connectionError) {
        console.error('Connection lookup error:', connectionError);
        setError('Error checking existing connections. Please try again.');
        setLoading(false);
        return;
      }

      if (existingConnection) {
        if (existingConnection.status === 'pending') {
          setError('Connection request already sent');
        } else if (existingConnection.status === 'accepted') {
          setError('You are already connected to this user');
        } else {
          setError('Connection request was previously rejected');
        }
        setLoading(false);
        return;
      }

      // Send connection request
      const { error: insertError } = await supabase
        .from('connections')
        .insert({
          requester_id: user?.id,
          receiver_id: userProfile.id,
          status: 'pending',
        });

      if (insertError) throw insertError;

      // Create notification for the receiver
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: userProfile.id,
          type: 'connection_request',
          content: `${user?.email} wants to connect with you`,
          data: {
            requester_id: user?.id,
            requester_email: user?.email,
          },
        });

      if (notificationError) throw notificationError;

      toast.success('Connection request sent successfully!');
      onSuccess();
    } catch (error) {
      console.error('Error sending connection request:', error);
      setError('Failed to send connection request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add New Contact</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Contact's Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="contact@email.com"
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Sending...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Send Connection Request
                </div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddContactModal;
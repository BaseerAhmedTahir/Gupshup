import React, { useState } from 'react';
import { X, Settings, Save, Loader2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import GroupAvatarSelector from './GroupAvatarSelector';
import toast from 'react-hot-toast';

interface Group {
  id: string;
  name: string;
  description: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
}

interface GroupSettingsModalProps {
  group: Group;
  onClose: () => void;
  onUpdate: (updatedGroup: Group) => void;
}

const GroupSettingsModal: React.FC<GroupSettingsModalProps> = ({ 
  group, 
  onClose, 
  onUpdate 
}) => {
  const [groupName, setGroupName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [avatarUrl, setAvatarUrl] = useState(group.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const { user } = useAuth();

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!groupName.trim()) {
      newErrors.groupName = 'Group name is required';
    } else if (groupName.trim().length < 2) {
      newErrors.groupName = 'Group name must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkNameAvailability = async (name: string) => {
    if (name.trim() === group.name) return true; // Same name is allowed
    
    try {
      const { data, error } = await supabase.rpc('check_group_name_availability', {
        p_name: name.trim()
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error checking name availability:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!user || !validateForm()) return;

    // Check if group name is available
    const isNameAvailable = await checkNameAvailability(groupName);
    if (!isNameAvailable) {
      setErrors({ groupName: 'Group name already exists. Please choose a different name.' });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('update_group_info_by_member', {
        p_group_id: group.id,
        p_name: groupName.trim() !== group.name ? groupName.trim() : null,
        p_description: description.trim() !== group.description ? description.trim() : null,
        p_avatar_url: avatarUrl !== group.avatar_url ? avatarUrl : null,
        p_user_id: user.id
      });

      if (error) throw error;

      if (!data.success) {
        toast.error(data.error || 'Failed to update group');
        return;
      }

      // Update local state
      const updatedGroup = {
        ...group,
        name: groupName.trim(),
        description: description.trim(),
        avatar_url: avatarUrl
      };

      onUpdate(updatedGroup);
      toast.success('Group updated successfully!');
      onClose();
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            Group Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Avatar Section */}
          <div className="flex flex-col items-center space-y-4">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Group Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users className="w-12 h-12 text-gray-400" />
              )}
            </div>
            
            <GroupAvatarSelector
              selectedAvatar={avatarUrl}
              onAvatarSelect={setAvatarUrl}
            />
          </div>

          {/* Group Name */}
          <div>
            <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-2">
              Group Name *
            </label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (errors.groupName) {
                  const newErrors = { ...errors };
                  delete newErrors.groupName;
                  setErrors(newErrors);
                }
              }}
              placeholder="Group Name"
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.groupName ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.groupName && (
              <p className="mt-2 text-sm text-red-600">{errors.groupName}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Group description..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={loading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Saving...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupSettingsModal;
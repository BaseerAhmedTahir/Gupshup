import React, { useState, useEffect } from 'react';
import { X, Users, Loader2, UserPlus, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface CreateGroupModalProps {
  onClose: () => void;
  onSuccess: (groupId: string) => void;
}

interface Contact {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  status?: string;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onSuccess }) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [memberEmails, setMemberEmails] = useState<string[]>(['']);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showContactSelector, setShowContactSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const { user } = useAuth();

  // Check group name availability
  const checkNameAvailability = async (name: string) => {
    if (!name.trim()) return true;
    
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

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('connections')
        .select(`
          *,
          requester:profiles!connections_requester_id_fkey(id, email, display_name, avatar_url),
          receiver:profiles!connections_receiver_id_fkey(id, email, display_name, avatar_url)
        `)
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (data) {
        const contactList = data.map(connection => {
          const isRequester = connection.requester_id === user.id;
          return isRequester ? connection.receiver : connection.requester;
        });
        setContacts(contactList);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!groupName.trim()) {
      newErrors.groupName = 'Group name is required';
    }

    const validEmails = memberEmails.filter(email => email.trim() && validateEmail(email.trim()));
    if (validEmails.length === 0) {
      newErrors.members = 'At least one valid email is required';
    }

    memberEmails.forEach((email, index) => {
      if (email.trim() && !validateEmail(email.trim())) {
        newErrors[`email_${index}`] = 'Invalid email format';
      }
      if (email.trim() === user?.email) {
        newErrors[`email_${index}`] = 'Cannot add yourself';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addEmailField = () => {
    setMemberEmails([...memberEmails, '']);
  };

  const removeEmailField = (index: number) => {
    if (memberEmails.length > 1) {
      const newEmails = memberEmails.filter((_, i) => i !== index);
      setMemberEmails(newEmails);
    }
  };

  const updateEmail = (index: number, value: string) => {
    const newEmails = [...memberEmails];
    newEmails[index] = value;
    setMemberEmails(newEmails);
    
    // Clear error for this field
    if (errors[`email_${index}`]) {
      const newErrors = { ...errors };
      delete newErrors[`email_${index}`];
      setErrors(newErrors);
    }
  };

  const selectContact = (contact: Contact, index: number) => {
    updateEmail(index, contact.email);
    // Add to selected contacts if not already there
    if (!selectedContacts.find(c => c.id === contact.id)) {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const toggleContactSelection = (contact: Contact) => {
    const isSelected = selectedContacts.find(c => c.id === contact.id);
    if (isSelected) {
      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
      // Remove from email fields
      const emailIndex = memberEmails.findIndex(email => email === contact.email);
      if (emailIndex !== -1) {
        const newEmails = [...memberEmails];
        newEmails[emailIndex] = '';
        setMemberEmails(newEmails);
      }
    } else {
      setSelectedContacts([...selectedContacts, contact]);
      // Add to first empty email field or create new one
      const emptyIndex = memberEmails.findIndex(email => !email.trim());
      if (emptyIndex !== -1) {
        updateEmail(emptyIndex, contact.email);
      } else {
        setMemberEmails([...memberEmails, contact.email]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    // Check if group name is available
    const isNameAvailable = await checkNameAvailability(groupName);
    if (!isNameAvailable) {
      setErrors({ groupName: 'Group name already exists. Please choose a different name.' });
      return;
    }
    setLoading(true);

    try {
      // Create the group
      const { data: groupData, error: groupError } = await supabase.rpc('create_group', {
        group_name: groupName.trim(),
        group_description: description.trim(),
        creator_id: user?.id
      });

      if (groupError) throw groupError;

      const groupId = groupData;

      // Process all valid emails
      const validEmails = memberEmails.filter(email => email.trim() && validateEmail(email.trim()));
      let addedDirectly = 0;
      let invitationsSent = 0;
      let notFound = 0;
      
      for (const email of validEmails) {
        try {
          const { data: result, error } = await supabase.rpc('add_user_to_group_with_check', {
            p_group_id: groupId,
            p_user_email: email.trim(),
            p_added_by: user?.id,
            p_send_notification: true
          });

          if (error) throw error;

          if (result.success) {
            if (result.auto_added) {
              addedDirectly++;
            } else {
              invitationsSent++;
            }
          } else if (!result.user_exists) {
            notFound++;
          }
        } catch (error) {
          console.error(`Error processing ${email}:`, error);
        }
      }

      // Show summary message
      let message = 'Group created successfully!';
      if (addedDirectly > 0) {
        message += ` ${addedDirectly} contact${addedDirectly > 1 ? 's' : ''} added directly.`;
      }
      if (invitationsSent > 0) {
        message += ` ${invitationsSent} invitation${invitationsSent > 1 ? 's' : ''} sent.`;
      }
      if (notFound > 0) {
        message += ` ${notFound} user${notFound > 1 ? 's' : ''} not found.`;
      }

      toast.success(message);
      onSuccess(groupId);
    } catch (error) {
      console.error('Error creating group:', error);
      if (error.message?.includes('duplicate key')) {
        setErrors({ groupName: 'Group name already exists. Please choose a different name.' });
      } else {
        toast.error('Failed to create group');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-600" />
            Create New Group
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[70vh]">
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
                onBlur={async () => {
                  if (groupName.trim()) {
                    const isAvailable = await checkNameAvailability(groupName);
                    if (!isAvailable) {
                      setErrors({ ...errors, groupName: 'Group name already exists. Please choose a different name.' });
                    }
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

            {/* Member Emails */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Invite Members *
                </label>
                <button
                  type="button"
                  onClick={() => setShowContactSelector(!showContactSelector)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showContactSelector ? 'Hide Contacts' : 'Select from Contacts'}
                </button>
              </div>

              {/* Contact Selector */}
              {showContactSelector && contacts.length > 0 && (
                <div className="mb-4 p-4 bg-gray-50 rounded-xl">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Your Contacts</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {contacts.map(contact => (
                      <div
                        key={contact.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedContacts.find(c => c.id === contact.id)
                            ? 'bg-blue-100 border border-blue-300'
                            : 'bg-white hover:bg-gray-100 border border-gray-200'
                        }`}
                        onClick={() => toggleContactSelection(contact)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            {contact.avatar_url ? (
                              <img
                                src={contact.avatar_url}
                                alt={contact.display_name}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-sm font-semibold text-gray-600">
                                {contact.email.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {contact.display_name || contact.email}
                            </p>
                            <p className="text-xs text-gray-500">{contact.email}</p>
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedContacts.find(c => c.id === contact.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300'
                        }`}>
                          {selectedContacts.find(c => c.id === contact.id) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Contacts Display */}
              {selectedContacts.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">Selected contacts:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedContacts.map(contact => (
                      <div
                        key={contact.id}
                        className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                      >
                        <span>{contact.display_name || contact.email}</span>
                        <button
                          type="button"
                          onClick={() => toggleContactSelection(contact)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Input Fields */}
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Or add members by email:</p>
                <div className="space-y-3">
                  {memberEmails.map((email, index) => (
                    <div key={index} className="relative">
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => updateEmail(index, e.target.value)}
                            placeholder="email@example.com"
                            className={`w-full pl-10 pr-3 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              errors[`email_${index}`] ? 'border-red-500' : 'border-gray-300'
                            }`}
                            disabled={loading}
                          />
                          
                          {/* Contact suggestions */}
                          {email.length > 0 && contacts.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-32 overflow-y-auto z-10">
                              {contacts
                                .filter(contact => 
                                  contact.email.toLowerCase().includes(email.toLowerCase()) ||
                                  contact.display_name.toLowerCase().includes(email.toLowerCase())
                                )
                                .slice(0, 3)
                                .map(contact => (
                                  <button
                                    key={contact.id}
                                    type="button"
                                    onClick={() => selectContact(contact, index)}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                                  >
                                    <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                                      {contact.avatar_url ? (
                                        <img
                                          src={contact.avatar_url}
                                          alt={contact.display_name}
                                          className="w-full h-full rounded-full object-cover"
                                        />
                                      ) : (
                                        <span className="text-xs font-semibold text-gray-600">
                                          {contact.email.charAt(0).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{contact.display_name || contact.email}</p>
                                      <p className="text-xs text-gray-500">{contact.email}</p>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        
                        {memberEmails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEmailField(index)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                            disabled={loading}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {errors[`email_${index}`] && (
                        <p className="mt-1 text-sm text-red-600">{errors[`email_${index}`]}</p>
                      )}
                    </div>
                  ))}
                  
                  <button
                    type="button"
                    onClick={addEmailField}
                    className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
                    disabled={loading}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add another email
                  </button>
                  
                  {errors.members && (
                    <p className="text-sm text-red-600">{errors.members}</p>
                  )}
                </div>
              </div>
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
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating...
                  </div>
                ) : (
                  'Create Group'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
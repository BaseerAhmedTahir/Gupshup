import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import ChatWindow from '../Chat/ChatWindow';
import GroupChatWindow from '../Groups/GroupChatWindow';

const Layout: React.FC = () => {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const handleContactSelect = (contactId: string) => {
    setSelectedContact(contactId);
    setSelectedGroup(null);
  };

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroup(groupId);
    setSelectedContact(null);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Sidebar 
        selectedContact={selectedContact}
        selectedGroup={selectedGroup}
        onContactSelect={handleContactSelect}
        onGroupSelect={handleGroupSelect}
      />
      <main className="flex-1 overflow-hidden bg-white shadow-elegant-lg">
        {selectedContact ? (
          <ChatWindow contactId={selectedContact} />
        ) : selectedGroup ? (
          <GroupChatWindow groupId={selectedGroup} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 bg-gradient-to-br from-white to-gray-50">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                <MessageCircle className="w-12 h-12 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to ChatApp</h3>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to Gupshup</h3>
              <p className="text-gray-500 text-lg">Select a contact or group to start chatting</p>
              <div className="mt-8 flex justify-center space-x-4">
                <div className="flex items-center space-x-2 text-gray-400">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm">Real-time messaging</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">File sharing</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-400">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-sm">Group chats</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Layout;
"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Send, MessageSquare, Image, FileText, BarChart3, Clock, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@/utils/supabase/client'
import { Button } from "@/components/ui/button"
import { redirect } from 'next/navigation'
import { signOutAction } from "@/app/actions"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  content: string
  sender: string
  timestamp: string
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  timestamp: string
  messages: Message[]
}

interface DatabaseSession {
  session_id: string
  title: string
  timestamp: string
  content: string
  sender: string
}

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([{
    id: uuidv4(),
    content: "Hello! How can I assist you today? If you have any questions or need information on a specific topic, feel free to ask!",
    sender: 'assistant',
    timestamp: new Date().toISOString()
  }])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Load chat sessions
  const loadChatSessions = async () => {
    try {
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('timestamp', { ascending: false })
      
      if (error) {
        console.error('Error loading chat sessions:', error)
        return
      }

      if (!sessions) return

      // Group messages by session_id and use the first message's title
      const groupedSessions = sessions.reduce((acc: Record<string, ChatSession>, curr: DatabaseSession) => {
        if (!acc[curr.session_id]) {
          acc[curr.session_id] = {
            id: curr.session_id,
            title: curr.title,
            timestamp: curr.timestamp,
            created_at: curr.timestamp,
            messages: []
          }
        }
        acc[curr.session_id].messages.push({
          id: uuidv4(),
          content: curr.content,
          sender: curr.sender === 'Machine' ? 'assistant' : 'user',
          timestamp: curr.timestamp
        })
        return acc
      }, {})

      // Convert to array and sort by latest message
      const sessionArray = Object.values(groupedSessions) as ChatSession[]
      sessionArray.sort((a: ChatSession, b: ChatSession) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      setChatSessions(sessionArray)
    } catch (error) {
      console.error('Error loading chat sessions:', error)
    }
  }

  // Load chat sessions on mount
  useEffect(() => {
    loadChatSessions()
  }, [])

  // Load messages when session changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentSessionId) {
        // Keep the default welcome message when no session is selected
        return
      }
      
      const { data: messages, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('timestamp', { ascending: true })

      if (error) {
        console.error('Error loading messages:', error)
        return
      }

      if (messages && messages.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        // Start with welcome message and add loaded messages
        const welcomeMessage = {
          id: uuidv4(),
          content: "Hello! How can I assist you today? If you have any questions or need information on a specific topic, feel free to ask!",
          sender: 'assistant',
          timestamp: new Date().toISOString()
        }
        const loadedMessages = messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender === (user?.email || 'user') ? 'user' : 'assistant',
          timestamp: msg.timestamp
        }))
        setMessages([welcomeMessage, ...loadedMessages])
      }
    }

    loadMessages()
  }, [currentSessionId])

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const startNewChat = async () => {
    setCurrentSessionId(null)
    setMessages([{
      id: uuidv4(),
      content: "Hello! How can I assist you today? If you have any questions or need information on a specific topic, feel free to ask!",
      sender: 'assistant',
      timestamp: new Date().toISOString()
    }])
  }

  const selectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId)
    setMessages([]) // Clear messages before loading new ones
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    const messageText = inputMessage
    setInputMessage("")
    setIsLoading(true)

    // Add user message immediately
    const userMessage = {
      id: uuidv4(),
      content: messageText,
      sender: 'user',
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    try {
      // If no session exists, create one first
      let sessionId = currentSessionId
      if (!sessionId) {
        const response = await fetch('/api/chat/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          throw new Error('Failed to create session')
        }
        
        const data = await response.json()
        sessionId = data.sessionId
        setCurrentSessionId(sessionId)
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageText,
          sessionId: sessionId
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }

      const data = await response.json()
      
      // Add AI response while preserving existing messages
      const aiMessage = {
        id: uuidv4(),
        content: data.message,
        sender: 'assistant',
        timestamp: data.timestamp || new Date().toISOString()
      }

      setMessages(prev => [...prev, aiMessage])
      
      // Refresh chat sessions to show the new chat with its title
      await loadChatSessions()
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove the user message if AI response failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id))
      setInputMessage(messageText) // Restore the message if it failed
    } finally {
      setIsLoading(false)
    }
  }

  // AI Typing Indicator component
  const TypingIndicator = () => (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
      className="flex items-center space-x-2 p-4"
    >
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
      </div>
      <span className="text-sm text-gray-400">AI is typing...</span>
    </motion.div>
  )

  // If we're server-side or not yet initialized, show a loading state
  if (!supabase) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-4 flex flex-col">
        <button
          onClick={startNewChat}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded flex items-center justify-center mb-4"
        >
          <MessageSquare className="h-5 w-5 mr-2" />
          New Chat
        </button>

        <div className="text-sm text-gray-400 mb-2">Recent Chats</div>
        <div className="flex-1 overflow-y-auto">
          {chatSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`w-full text-left p-2 hover:bg-gray-800 rounded ${
                currentSessionId === session.id ? 'bg-gray-800' : ''
              }`}
            >
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                <span className="truncate">{session.title || 'New Chat'}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-auto">
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center p-2 hover:bg-gray-800 rounded text-red-400"
            >
              <LogOut className="h-5 w-5 mr-2" />
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {messages.length === 0 ? (
          // Welcome screen
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-950">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="text-center p-4">
                <Image className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-300">Create and edit images</div>
              </div>
              <div className="text-center p-4">
                <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-300">Write and format text</div>
              </div>
              <div className="text-center p-4">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-300">Analyze data</div>
              </div>
              <div className="text-center p-4">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div className="text-sm text-gray-300">Answer questions</div>
              </div>
            </div>
            <h2 className="text-xl text-gray-300 mb-4">How can I help you today?</h2>
          </div>
        ) : (
          // Chat messages
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-950">
            <motion.div
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  variants={fadeInUp}
                  className={cn(
                    "flex items-start space-x-2 p-4 rounded-lg",
                    message.sender === 'user' 
                      ? "bg-blue-600 text-white ml-auto max-w-[80%]" 
                      : "bg-gray-800 text-gray-100 max-w-[80%]"
                  )}
                >
                  <div className="flex-1 overflow-hidden prose prose-invert max-w-none">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({children}) => <p className="mb-2 text-gray-100">{children}</p>,
                        a: ({children, href}) => (
                          <a href={href} className="text-blue-400 hover:underline">
                            {children}
                          </a>
                        ),
                        ul: ({children}) => <ul className="list-disc list-inside mb-4">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal list-inside mb-4">{children}</ol>,
                        li: ({children}) => <li className="mb-1">{children}</li>,
                        h1: ({children}) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
                        h2: ({children}) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
                        h3: ({children}) => <h3 className="text-lg font-bold mb-2">{children}</h3>,
                        pre: ({children}) => (
                          <pre className="bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4">
                            {children}
                          </pre>
                        ),
                        code: ({children}) => (
                          <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">
                            {children}
                          </code>
                        ),
                        blockquote: ({children}) => (
                          <blockquote className="border-l-4 border-gray-600 pl-4 italic my-4">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="border-gray-600 my-8" />,
                        strong: ({children}) => <strong className="font-bold">{children}</strong>,
                        em: ({children}) => <em className="italic">{children}</em>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </motion.div>
              ))}
            </motion.div>
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-gray-800 p-4 bg-gray-900">
          <form onSubmit={handleSubmit} className="flex items-center">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Message ChatGPT..."
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className={`rounded-lg p-2 ${
                isLoading || !inputMessage.trim()
                  ? 'bg-gray-700 text-gray-400'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isLoading ? (
                <Clock className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

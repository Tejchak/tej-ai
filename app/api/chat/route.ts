import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    let requestBody;
    
    try {
      requestBody = await request.json()
    } catch (error) {
      console.error('Request parsing error:', error)
      return NextResponse.json({ 
        response: "I apologize, but I couldn't process that request. Could you try again?" 
      })
    }

    const { message, sessionId, userId } = requestBody
    if (!message?.trim() || !sessionId || !userId) {
      console.error('Missing required fields:', { message, sessionId, userId })
      return NextResponse.json({ 
        response: "I apologize, but something went wrong. Please try again or refresh the page." 
      })
    }

    console.log('Calling Langflow API...')
    if (!process.env.LANGFLOW_API_URL || !process.env.LANGFLOW_API_KEY) {
      console.error('Missing API configuration')
      return NextResponse.json({ 
        response: "I apologize, but I'm having trouble connecting to my services right now. Please try again in a moment." 
      })
    }

    const langflowResponse = await fetch(process.env.LANGFLOW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGFLOW_API_KEY}`,
        'Origin': process.env.VERCEL_URL || 'http://localhost:3000'
      },
      body: JSON.stringify({
        input_value: message,
        tweaks: {},
        chat_history: []
      })
    })

    if (!langflowResponse.ok) {
      console.error('Langflow API error:', {
        status: langflowResponse.status,
        statusText: langflowResponse.statusText
      })
      return NextResponse.json({ 
        response: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment." 
      })
    }

    const data = await langflowResponse.json()
    console.log('Langflow API response:', JSON.stringify(data, null, 2))

    // Extract the actual message from the Langflow response
    const aiMessage = data.outputs?.[0]?.outputs?.[0]?.artifacts?.message

    if (!aiMessage) {
      console.error('Failed to extract message from response')
      return NextResponse.json({ 
        response: "I apologize, but I couldn't generate a proper response. Could you rephrase your question?" 
      })
    }

    return NextResponse.json({ response: aiMessage })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      response: "I apologize, but something unexpected happened. Please try again in a moment." 
    })
  }
}
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewMissionPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/new-request?tab=mission')
  }, [router])

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="mt-4 text-muted-foreground">Redirection...</p>
      </div>
    </div>
  )
}

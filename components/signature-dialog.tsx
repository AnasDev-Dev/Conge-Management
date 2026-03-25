'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, Pen, Upload, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react'

interface SignatureDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (signatureDataUrl: string, saveForFuture: boolean) => void
  /** Existing saved signature URL (if any) */
  savedSignatureUrl?: string | null
  /** 'employee' = draw only, 'approver' = draw + upload + saved */
  mode?: 'employee' | 'approver'
  title?: string
  loading?: boolean
}

type Tab = 'saved' | 'draw' | 'upload'

export function SignatureDialog({
  open,
  onClose,
  onConfirm,
  savedSignatureUrl,
  mode = 'approver',
  title = 'Signature',
  loading = false,
}: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(
    mode === 'employee' ? 'draw' : savedSignatureUrl ? 'saved' : 'draw'
  )
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null)
  const [saveForFuture, setSaveForFuture] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUploadedDataUrl(null)
      setSaveForFuture(false)
      setIsEmpty(true)
      setActiveTab(mode === 'employee' ? 'draw' : savedSignatureUrl ? 'saved' : 'draw')
    }
  }, [open, mode, savedSignatureUrl])

  // Initialize signature pad when draw tab is active
  const initPad = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const container = canvas.parentElement
    if (!container) return

    // Set canvas size to match container
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 200

    if (padRef.current) {
      padRef.current.off()
      padRef.current.clear()
    }

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    })

    pad.addEventListener('endStroke', () => {
      setIsEmpty(pad.isEmpty())
    })

    padRef.current = pad
    setIsEmpty(true)
  }, [])

  useEffect(() => {
    if (open && activeTab === 'draw') {
      // Small delay to ensure DOM is rendered
      const timer = setTimeout(initPad, 100)
      return () => clearTimeout(timer)
    }
  }, [open, activeTab, initPad])

  const handleClear = () => {
    padRef.current?.clear()
    setIsEmpty(true)
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setUploadedDataUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleConfirm = () => {
    let dataUrl: string | null = null

    if (activeTab === 'saved' && savedSignatureUrl) {
      onConfirm(savedSignatureUrl, false)
      return
    }

    if (activeTab === 'draw' && padRef.current && !padRef.current.isEmpty()) {
      dataUrl = padRef.current.toDataURL('image/png')
    }

    if (activeTab === 'upload' && uploadedDataUrl) {
      dataUrl = uploadedDataUrl
    }

    if (dataUrl) {
      onConfirm(dataUrl, saveForFuture)
    }
  }

  const canConfirm =
    (activeTab === 'saved' && !!savedSignatureUrl) ||
    (activeTab === 'draw' && !isEmpty) ||
    (activeTab === 'upload' && !!uploadedDataUrl)

  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'saved', label: 'Signature sauvegardée', icon: <ImageIcon className="h-4 w-4" />, show: mode === 'approver' && !!savedSignatureUrl },
    { key: 'draw', label: 'Dessiner', icon: <Pen className="h-4 w-4" />, show: true },
    { key: 'upload', label: 'Importer', icon: <Upload className="h-4 w-4" />, show: mode === 'approver' },
  ]

  const visibleTabs = tabs.filter(t => t.show)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Tab selector — only show if multiple tabs */}
        {visibleTabs.length > 1 && (
          <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
            {visibleTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Saved signature preview */}
        {activeTab === 'saved' && savedSignatureUrl && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="rounded-xl border border-border/70 bg-white p-4">
              <img
                src={savedSignatureUrl}
                alt="Signature sauvegardée"
                className="max-h-[150px] max-w-full object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground">Votre signature sauvegardée sera utilisée</p>
          </div>
        )}

        {/* Drawing canvas */}
        {activeTab === 'draw' && (
          <div className="space-y-3">
            <div className="relative rounded-xl border-2 border-dashed border-border/70 bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full touch-none"
                style={{ height: 200 }}
              />
              {isEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground/50">Signez ici</p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 text-xs text-muted-foreground gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Effacer
              </Button>
            </div>
          </div>
        )}

        {/* Upload */}
        {activeTab === 'upload' && (
          <div className="space-y-3 py-2">
            {uploadedDataUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border border-border/70 bg-white p-4">
                  <img
                    src={uploadedDataUrl}
                    alt="Signature importée"
                    className="max-h-[150px] max-w-full object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadedDataUrl(null)}
                  className="h-8 text-xs text-muted-foreground gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-6 py-8 transition-all hover:border-primary/40 hover:bg-primary/5">
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">Cliquez pour importer</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">PNG, JPG ou WEBP</p>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        )}

        {/* Save for future checkbox */}
        {activeTab !== 'saved' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <div className={cn(
              'flex h-5 w-5 items-center justify-center rounded border-2 transition-all',
              saveForFuture ? 'border-primary bg-primary' : 'border-border'
            )}>
              {saveForFuture && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <input
              type="checkbox"
              checked={saveForFuture}
              onChange={(e) => setSaveForFuture(e.target.checked)}
              className="hidden"
            />
            <span className="text-sm text-muted-foreground">Sauvegarder ma signature pour les prochaines fois</span>
          </label>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Appliquer la signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


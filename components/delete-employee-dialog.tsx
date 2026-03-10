'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteEmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
  employee: {
    id: string
    full_name: string
    email: string | null
  }
}

export function DeleteEmployeeDialog({ open, onOpenChange, onDeleted, employee }: DeleteEmployeeDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la desactivation de l'employe")
        return
      }

      toast.success(`${employee.full_name} a ete desactive`)
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      console.error('Delete employee error:', err)
      toast.error('Une erreur inattendue est survenue')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Desactiver l&apos;employe
          </DialogTitle>
          <DialogDescription>
            Etes-vous sur de vouloir desactiver <strong>{employee.full_name}</strong> ({employee.email || ''}) ?
            Cette action va desactiver son compte et empecher toute connexion. Les donnees historiques seront conservees.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Desactiver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

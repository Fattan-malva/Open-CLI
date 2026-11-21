import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TaskPayload, TaskRecord, TaskPriority, TaskStatus } from '../data/records'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'Sedang dikerjakan' },
  { value: 'done', label: 'Selesai' },
  { value: 'canceled', label: 'Dibatalkan' },
]

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Rendah' },
  { value: 'medium', label: 'Sedang' },
  { value: 'high', label: 'Tinggi' },
  { value: 'critical', label: 'Kritis' },
]

const markerPresets = ['📌', '🔥', '⭐', '🗂️', '✅']

const formSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi.'),
  description: z.string(),
  status: z.enum(['todo', 'in_progress', 'done', 'canceled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string(),
  dueDate: z.string(),
  marker: z.string(),
})

type FormValues = z.infer<typeof formSchema>

type TaskFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  current: TaskRecord | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: TaskPayload) => void
}

export function TaskFormDialog({
  open,
  mode,
  current,
  busy,
  onOpenChange,
  onSubmit,
}: TaskFormDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      category: '',
      dueDate: '',
      marker: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && current) {
      form.reset({
        title: current.title ?? '',
        description: current.description ?? '',
        status: current.status,
        priority: current.priority,
        category: current.category ?? '',
        dueDate: current.dueDate ?? '',
        marker: current.marker ?? '',
      })
    } else {
      form.reset({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        category: '',
        dueDate: '',
        marker: '',
      })
    }
  }, [open, mode, current, form])

  const submit = (values: FormValues) => {
    const payload: TaskPayload = {
      title: values.title.trim(),
      description: values.description.trim(),
      status: values.status,
      priority: values.priority,
      category: values.category.trim(),
      dueDate: values.dueDate ? values.dueDate : null,
      marker: values.marker.trim(),
    }
    onSubmit(payload)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Ubah Tugas' : 'Tugas Baru'}</DialogTitle>
          <DialogDescription>
            Isi detail tugas. Simpan untuk melanjutkan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id='task-form' onSubmit={form.handleSubmit(submit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul</FormLabel>
                  <FormControl>
                    <Input placeholder='Judul tugas' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi</FormLabel>
                  <FormControl>
                    <Textarea placeholder='Deskripsi singkat' className='min-h-20' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Pilih status' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioritas</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Pilih prioritas' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <FormControl>
                      <Input placeholder='Contoh: Kerja' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='dueDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tanggal jatuh tempo</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='marker'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Penanda (emoji/teks)</FormLabel>
                  <FormControl>
                    <Input placeholder='Contoh: 🔥 atau P1' {...field} />
                  </FormControl>
                  <div className='flex flex-wrap gap-2 pt-1'>
                    {markerPresets.map((m) => (
                      <Button
                        key={m}
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-8 px-2'
                        onClick={() => field.onChange(m)}
                      >
                        {m}
                      </Button>
                    ))}
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-8 px-2'
                      onClick={() => field.onChange('')}
                    >
                      Kosong
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className='gap-2'>
          <DialogClose asChild>
            <Button variant='outline' disabled={busy}>
              Batal
            </Button>
          </DialogClose>
          <Button type='submit' form='task-form' disabled={busy}>
            {busy ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TaskRecord, TodoPayload, TodoRecord } from '../data/records'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const markerPresets = ['📌', '🔥', '⭐', '🗂️', '✅']

const formSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi.'),
  taskId: z.string(),
  dueDate: z.string(),
  marker: z.string(),
})

type FormValues = z.infer<typeof formSchema>

type TodoFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  current: TodoRecord | null
  tasks: TaskRecord[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: TodoPayload, done?: boolean) => void
}

export function TodoFormDialog({
  open,
  mode,
  current,
  tasks,
  busy,
  onOpenChange,
  onSubmit,
}: TodoFormDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      taskId: '',
      dueDate: '',
      marker: '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && current) {
      form.reset({
        title: current.title ?? '',
        taskId: current.taskId ?? '',
        dueDate: current.dueDate ?? '',
        marker: current.marker ?? '',
      })
    } else {
      form.reset({
        title: '',
        taskId: '',
        dueDate: '',
        marker: '',
      })
    }
  }, [open, mode, current, form])

  const submit = (values: FormValues) => {
    const payload: TodoPayload = {
      title: values.title.trim(),
      taskId: values.taskId ? values.taskId : null,
      dueDate: values.dueDate ? values.dueDate : null,
      marker: values.marker.trim(),
    }
    onSubmit(payload, current?.done)
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
          <DialogTitle>{mode === 'edit' ? 'Ubah Todo' : 'Todo Baru'}</DialogTitle>
          <DialogDescription>
            Kelola todo mandiri atau tautkan ke tugas.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id='todo-form' onSubmit={form.handleSubmit(submit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul</FormLabel>
                  <FormControl>
                    <Input placeholder='Judul todo' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='taskId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tautkan ke tugas (opsional)</FormLabel>
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                  >
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Pilih tugas' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='none'>Tanpa tugas</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
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
            <FormField
              control={form.control}
              name='marker'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Penanda (emoji/teks)</FormLabel>
                  <FormControl>
                    <Input placeholder='Contoh: ✅ atau P1' {...field} />
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
          <Button type='submit' form='todo-form' disabled={busy}>
            {busy ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

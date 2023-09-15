import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react"
import { FileVideo, Upload } from "lucide-react";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Textarea } from "./ui/textarea";
import { api } from "@/lib/axios";
import { fetchFile } from "@ffmpeg/util";
import { getFFmpeg } from "@/lib/ffmpeg";

type Status = 'waiting' | 'converting' | 'uploading' | 'generating' | 'success'

const statusMessages = {
  converting: 'Convertendo...',
  generating: 'Transcrevendo...',
  uploading: 'Carregando...',
  success: 'Sucesso!'
}

interface VideoInputFormProps {
  onVideoUploaded: (id: string) => void
}

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('waiting')
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  
  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget

    if (!files) {
      return
    }

    const selectedFile = files[0]

    setVideoFile(selectedFile)
  }

  async function convertVideoToAudio(video: File) {
    console.log("Convert started.")

    const ffmpeg = await getFFmpeg()

    await ffmpeg.writeFile('input.mp4', await fetchFile(video))

    // ffmpeg.on('log', log => {
    //   console.log(log)
    // })

    ffmpeg.on('progress', progress => {
      console.log('Convert progress: ' + Math.round(progress.progress * 100))
    })

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20k',
      '-acodec',
      'libmp3lame',
      'output.mp3'
    ])

    const data = await ffmpeg.readFile('output.mp3')

    const audioFileBlob = new Blob([data], {type: 'audio/mpeg'})
    const audioFile = new File([audioFileBlob], 'audio.mp3', {
      type: 'audio/mpeg'
    })

    console.log('Convert finished')


    return audioFile
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const prompt = promptInputRef.current?.value

    if (!videoFile) {
      setStatus('waiting')
      return
    }

    // converter o video em audio
    setStatus('converting')

    const audioFile = await convertVideoToAudio(videoFile)

    const data = new FormData()

    data.append('file', audioFile)

    // fazendo uploading do video convertido
    setStatus('uploading')

    const response = await api.post('/videos', data)

    const videoId = response.data.video.id

    // gerando a transcricao

    setStatus('generating')

    await api.post(`/videos/${videoId}/transcription`, {
      prompt,
    })

    setStatus('success')

    props.onVideoUploaded(videoId)
  }

  const previewURL = useMemo(() => {
    if (!videoFile) {
      setStatus('waiting')
      return null
    }

    return URL.createObjectURL(videoFile)
  }, [videoFile])

  return (
    <form onSubmit={handleUploadVideo} className="space-y-6" action="">
      <label 
        htmlFor="video"
        className="relative border flex aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5"
      >
        {
          previewURL ? <video src={previewURL} controls={false} className="pointer-events-none absolute inset-0"/> : (
            <>
              <FileVideo className="w-4 h-4" />
              Selecione um video
            </>
          )
        }
      </label>

      <input className="sr-only" type="file" id="video" accept="vide/mp4" onChange={handleFileSelected} />
    
      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">
          Prompt de transcricao
        </Label>
        
        <Textarea
          ref={promptInputRef}
          disabled={status !== 'waiting'}
          id="transcription_prompt" 
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chave mencionadas no video separadas por virgula (,)"
        />
      </div>

      <Button
        data-success={status === 'success'}
        disabled={status !== 'waiting'}
        type="submit"
        className="w-full data-[success=true]:bg-emerald-400"
      >
        {
          status === 'waiting' ? (
            <>
              Carregar video
              <Upload className="h-4 w-4 ml-2" />
            </>
          ) : (
            statusMessages[status]
          )
        }
      </Button>
    </form>
  )
}
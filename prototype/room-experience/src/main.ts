import { mount } from 'svelte'
import './app.css'
document.documentElement.classList.add('dark')
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app

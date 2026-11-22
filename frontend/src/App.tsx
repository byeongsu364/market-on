import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Scan from './pages/Scan'
import Result from './pages/Result'
import Map from './pages/Map'
import Recipe from './pages/Recipe'
import Card from './pages/Card'
import Agent from './pages/Agent'
import Merchant from './pages/Merchant'

export default function App() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/scan" element={<Scan />} />
    <Route path="/result" element={<Result />} />
    <Route path="/map" element={<Map />} />
    <Route path="/recipe" element={<Recipe />} />
    <Route path="/card" element={<Card />} />
    <Route path="/agent" element={<Agent />} />
    <Route path="/merchant" element={<Merchant />} />
  </Routes>
}

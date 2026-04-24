/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, 
  Plus, 
  FileText, 
  Trash2, 
  Download, 
  Search, 
  AlertCircle,
  CheckCircle2,
  BookOpen,
  LayoutDashboard,
  User,
  Settings,
  ChevronDown,
  UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from './lib/utils';

// Constants
const DISCIPLINAS = [
  'Língua Portuguesa', 
  'Matemática', 
  'História', 
  'Geografia', 
  'Ciências', 
  'Arte', 
  'Religião', 
  'Inglês', 
  'Ed. Física', 
  'Literatura', 
  'Produção Textual'
];

const UNIDADES = ['I Unidade', 'II Unidade', 'III Unidade'];

const PREDEFINED_TURMAS = ['6ºM1', '7ºM1', '8ºM1', '9ºM1', '6ºV1', '7ºV1', '8ºV1', '9ºV1'];

interface Grade {
  a1: number;
  a2: number;
  a3: number;
  a4: number;
}

interface StudentGrades {
  [discipline: string]: {
    [unit: string]: Grade;
  };
}

interface Student {
  id: string;
  name: string;
  grades: StudentGrades;
}

interface AppData {
  classes: {
    [className: string]: Student[];
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem('gradeMasterData_v2');
    return saved ? JSON.parse(saved) : { classes: {} };
  });

  const [activeTurma, setActiveTurma] = useState<string>(() => {
    return localStorage.getItem('activeTurma_v2') || '';
  });

  const [importTurma, setImportTurma] = useState<string>('');

  const [activeDisciplina, setActiveDisciplina] = useState<string>(DISCIPLINAS[0]);
  const [activeUnidade, setActiveUnidade] = useState<string>(UNIDADES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem('professorProfile');
    return saved ? JSON.parse(saved) : { nome: '', escola: '', unidade: '', disciplina: '' };
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const isMounted = useRef(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('gradeMasterData_v2', JSON.stringify(data));
    
    if (isMounted.current) {
      setShowSaveToast(true);
      const timer = setTimeout(() => setShowSaveToast(false), 2000);
      return () => clearTimeout(timer);
    } else {
      isMounted.current = true;
    }
  }, [data]);

  useEffect(() => {
    localStorage.setItem('activeTurma_v2', activeTurma);
  }, [activeTurma]);

  useEffect(() => {
    localStorage.setItem('professorProfile', JSON.stringify(profile));
  }, [profile]);

  // Handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileParts = file.name.split('.');
    const fileExtension = fileParts.pop()?.toLowerCase();
    
    let rawTextData: string[] = [];

    try {
      if (['xls', 'xlsx', 'csv'].includes(fileExtension || '')) {
        const reader = new FileReader();
        const parseExcel = new Promise<string[]>((resolve) => {
          reader.onload = (e) => {
            const bstr = e.target?.result;
            const workbook = XLSX.read(bstr, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
            resolve(jsonData.flat().map(v => String(v)));
          };
        });
        reader.readAsBinaryString(file);
        rawTextData = await parseExcel;
      } else if (fileExtension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.extractRawText({ arrayBuffer });
        rawTextData = result.value.split('\n');
      } else if (fileExtension === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore
        const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str);
          rawTextData.push(...pageText);
        }
      } else if (fileExtension === 'txt') {
        const text = await file.text();
        rawTextData = text.split('\n');
      } else {
        alert("Formato de arquivo não suportado.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const students: Student[] = rawTextData
        .map(name => name?.trim())
        .filter(name => name && name.length > 2 && !['nome', 'Nome', 'NOME', 'Estudante', 'Aluno', 'ALUNO'].includes(name))
        .map(name => ({
          id: crypto.randomUUID(),
          name,
          grades: DISCIPLINAS.reduce((acc, disc) => {
            acc[disc] = UNIDADES.reduce((uAcc, unit) => {
              uAcc[unit] = { a1: 0, a2: 0, a3: 0, a4: 0 };
              return uAcc;
            }, {} as { [unit: string]: Grade });
            return acc;
          }, {} as StudentGrades)
        }));

      if (students.length === 0) {
        alert("Não foi possível encontrar nomes de alunos no arquivo. Verifique se o arquivo contém apenas a lista de nomes formatada em linhas ou colunas.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setData(prev => ({
        ...prev,
        classes: {
          ...prev.classes,
          [importTurma]: students
        }
      }));
      setActiveTurma(importTurma);
      setImportTurma('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error("Error parsing file:", error);
      alert("Ocorreu um erro ao ler o arquivo. Tente novamente com um formato mais simples.");
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateGrade = (studentId: string, field: keyof Grade, value: string) => {
    const numValue = Math.min(10, Math.max(0, parseFloat(value) || 0));
    setData(prev => {
      const students = [...(prev.classes[activeTurma] || [])];
      const studentIndex = students.findIndex(s => s.id === studentId);
      if (studentIndex === -1) return prev;

      const newStudents = [...students];
      const updatedStudent = { ...newStudents[studentIndex] };
      
      if (!updatedStudent.grades[activeDisciplina]) {
        updatedStudent.grades[activeDisciplina] = UNIDADES.reduce((acc, u) => {
          acc[u] = { a1: 0, a2: 0, a3: 0, a4: 0 };
          return acc;
        }, {} as { [u: string]: Grade });
      }

      updatedStudent.grades[activeDisciplina][activeUnidade] = {
        ...updatedStudent.grades[activeDisciplina][activeUnidade],
        [field]: numValue
      };

      newStudents[studentIndex] = updatedStudent;

      return {
        ...prev,
        classes: {
          ...prev.classes,
          [activeTurma]: newStudents
        }
      };
    });
  };

  const calculateMetrics = (student: Student) => {
    const disciplineGrades = student.grades[activeDisciplina] || {};
    const unitGrades = disciplineGrades[activeUnidade] || { a1: 0, a2: 0, a3: 0, a4: 0 };
    
    // Total da Unidade Selecionada (Soma das 4 avaliações)
    const totalUnidade = unitGrades.a1 + unitGrades.a2 + unitGrades.a3 + unitGrades.a4;
    
    // Soma de todas as unidades para a média final
    const somaTodosTotais = Object.values(disciplineGrades).reduce((acc, curr) => {
      return acc + (curr.a1 + curr.a2 + curr.a3 + curr.a4);
    }, 0);

    // Média Final baseada na soma das 3 unidades
    const mediaFinal = somaTodosTotais / 3;

    // Critério: 15 pontos mínimos no total da unidade para aprovação parcial
    const isAprovadoUnidade = totalUnidade >= 15;
    
    return { 
      totalUnidade, 
      mediaFinal, 
      isAprovado: isAprovadoUnidade
    };
  };

  const exportBoletimPDF = () => {
    if (!activeTurma) return;
    
    const doc = new jsPDF();
    const students = data.classes[activeTurma];

    doc.setFontSize(16);
    doc.text(`Organizador de Notas: ${activeTurma}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Professor: ${profile.nome || 'Não informado'} | Escola: ${profile.escola || 'Não informada'}`, 14, 28);
    doc.text(`Disciplina: ${profile.disciplina || 'Não informada'}`, 14, 34);
    
    doc.text(`Boletim Geral - Relatório Final`, 14, 42);
    doc.text(`Critério: Média Final >= 5.0`, 14, 48);

    const tableData = students.map(s => {
      const metrics = calculateMetrics(s);
      const grades = s.grades[activeDisciplina] || {};
      
      const t1 = (grades['I Unidade']?.a1 || 0) + (grades['I Unidade']?.a2 || 0) + (grades['I Unidade']?.a3 || 0) + (grades['I Unidade']?.a4 || 0);
      const t2 = (grades['II Unidade']?.a1 || 0) + (grades['II Unidade']?.a2 || 0) + (grades['II Unidade']?.a3 || 0) + (grades['II Unidade']?.a4 || 0);
      const t3 = (grades['III Unidade']?.a1 || 0) + (grades['III Unidade']?.a2 || 0) + (grades['III Unidade']?.a3 || 0) + (grades['III Unidade']?.a4 || 0);

      const media = (t1 + t2 + t3) / 3;

      return [
        s.name,
        t1.toFixed(1),
        t2.toFixed(1),
        t3.toFixed(1),
        media.toFixed(1),
        media >= 5 ? 'APROVADO' : ' REPROVADO'
      ];
    });

    autoTable(doc, {
      head: [['Estudante', 'Total I Unid', 'Total II Unid', 'Total III Unid', 'Média Final', 'Situação Final']],
      body: tableData,
      startY: 54,
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center', fontStyle: 'bold' },
        5: { halign: 'center' }
      }
    });

    doc.save(`boletim_geral_${activeTurma}_${activeDisciplina}.pdf`);
  };

  const exportToPDF = () => {
    if (!activeTurma) return;
    
    const doc = new jsPDF();
    const students = data.classes[activeTurma];

    doc.setFontSize(16);
    doc.text(`Organizador de Notas: ${activeTurma}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Professor: ${profile.nome || 'Não informado'} | Escola: ${profile.escola || 'Não informada'}`, 14, 28);
    doc.text(`Unidade: ${profile.unidade || 'Não informada'} | Disciplina: ${profile.disciplina || 'Não informada'}`, 14, 34);
    
    doc.text(`Relatório de Desempenho - ${activeDisciplina} | ${activeUnidade}`, 14, 42);
    doc.text(`Critério: Média Final (3 Unidades) >= 5.0 | Total da Unidade >= 15 pts`, 14, 48);

    const tableData = students.map(s => {
      const metrics = calculateMetrics(s);
      const g = (s.grades[activeDisciplina] || {})[activeUnidade] || { a1: 0, a2: 0, a3: 0, a4: 0 };
      return [
        s.name,
        g.a1.toFixed(1),
        g.a2.toFixed(1),
        g.a3.toFixed(1),
        g.a4.toFixed(1),
        metrics.totalUnidade.toFixed(1),
        metrics.isAprovado ? 'APROVADO' : ' REPROVADO'
      ];
    });

    autoTable(doc, {
      head: [['Estudante', 'Av I', 'Av II', 'Av III', 'Av IV', 'Total', 'Situação']],
      body: tableData,
      startY: 54,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center', fontStyle: 'bold' },
        6: { halign: 'center' }
      }
    });

    doc.save(`Diario_${activeTurma}_${activeUnidade}.pdf`);
  };

  const clearAllData = () => {
    if (confirm("Deseja apagar todos os registros identificados?")) {
      setData({ classes: {} });
      setActiveTurma('');
      localStorage.removeItem('gradeMasterData_v2');
    }
  };

  const removeTurma = (name: string) => {
    if (confirm(`Excluir a turma ${name}?`)) {
      setData(prev => {
        const newClasses = { ...prev.classes };
        delete newClasses[name];
        return { ...prev, classes: newClasses };
      });
      if (activeTurma === name) setActiveTurma('');
    }
  };

  const removeStudent = (studentId: string, studentName: string) => {
    if (confirm(`Tem certeza que deseja remover o estudante "${studentName}" desta turma?`)) {
      setData(prev => {
        const students = prev.classes[activeTurma] || [];
        const newStudents = students.filter(s => s.id !== studentId);
        return {
          ...prev,
          classes: {
            ...prev.classes,
            [activeTurma]: newStudents
          }
        };
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col overflow-hidden">
      
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            Organizador <span className="text-indigo-600 uppercase text-xs tracking-widest bg-indigo-50 px-2 py-0.5 rounded ml-1">de Notas</span>
          </h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium">{profile.nome || 'Professor'}</p>
            <p className="text-xs text-slate-500 uppercase tracking-tighter">{profile.escola || 'Configurar Perfil'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-400 transition-colors"
              title="Perfil do Professor"
            >
              <User className="w-5 h-5" />
            </button>
            <button 
              onClick={clearAllData}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Limpar todos os dados"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            >
               <h2 className="text-xl font-bold text-slate-800 mb-6">Perfil do Professor</h2>
               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome do Professor</label>
                   <input 
                     type="text" 
                     value={profile.nome} 
                     onChange={e => setProfile({...profile, nome: e.target.value})}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                     placeholder="Ex: Ricardo Almeida"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Escola</label>
                   <input 
                     type="text" 
                     value={profile.escola} 
                     onChange={e => setProfile({...profile, escola: e.target.value})}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                     placeholder="Nome da instituição"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unidade Escolar</label>
                   <input 
                     type="text" 
                     value={profile.unidade} 
                     onChange={e => setProfile({...profile, unidade: e.target.value})}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                     placeholder="Ex: Centro, Anexo, etc"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Disciplina Principal</label>
                   <input 
                     type="text" 
                     value={profile.disciplina} 
                     onChange={e => setProfile({...profile, disciplina: e.target.value})}
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                     placeholder="Sua disciplina"
                   />
                 </div>
               </div>
               <div className="mt-8 flex justify-end">
                 <button 
                   onClick={() => setIsProfileModalOpen(false)}
                   className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all active:scale-95"
                 >
                   Salvar e Fechar
                 </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Layout */}
      <main className="flex-1 p-8 grid grid-cols-12 gap-8 overflow-hidden bg-slate-50">
        
        {/* Left Sidebar: Configuration */}
        <aside className="col-span-12 lg:col-span-4 flex flex-col space-y-6 overflow-y-auto pr-1">
          
          {/* Section 1: Turma & Disciplina */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">1. Seleção de Turma</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select 
                    value={activeTurma}
                    onChange={(e) => setActiveTurma(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Selecione a turma...</option>
                    {Object.keys(data.classes).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                {activeTurma && (
                  <button 
                    onClick={() => removeTurma(activeTurma)}
                    className="p-3 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">2. Disciplina e Unidade</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <select 
                    value={activeDisciplina}
                    onChange={(e) => setActiveDisciplina(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {DISCIPLINAS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <select 
                    value={activeUnidade}
                    onChange={(e) => setActiveUnidade(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {UNIDADES.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Import */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex-1 flex flex-col min-h-[300px]">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">3. Importar Base de Alunos</label>
            
            <div className="mb-4">
              <select 
                value={importTurma}
                onChange={(e) => setImportTurma(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Selecione a turma de destino...</option>
                {PREDEFINED_TURMAS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div 
              onClick={() => {
                if (!importTurma) { 
                  alert('Por favor, selecione a turma de destino antes de importar o arquivo.');
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="flex-1 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-slate-100/50 hover:border-indigo-300 transition-all group"
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload} 
                accept=".csv, .xlsx, .xls, .pdf, .docx, .txt" 
                className="hidden" 
              />
              <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="text-sm font-medium text-slate-700">Carregar Arquivo com Alunos</p>
              <p className="text-xs text-slate-500 mt-2">Suporta .xls, .xlsx, .csv, .pdf, .docx e .txt</p>
              <button className="mt-4 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 shadow-sm">
                Procurar Arquivo
              </button>
            </div>
            <div className="mt-4 p-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-tight">
                <strong>Importante:</strong> Para uma importação correta, o arquivo deve conter <strong>apenas</strong> uma lista de nomes dos estudantes (um por linha ou coluna). Remova cabeçalhos complexos, outras colunas e imagens.
              </p>
            </div>
          </div>
        </aside>

        {/* Right: Data/Preview Area */}
        <section className="col-span-12 lg:col-span-8 flex flex-col overflow-hidden h-full">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                {activeTurma ? `Consolidado de Notas: ${activeTurma}` : 'Prévia dos Dados'}
              </h3>
              {activeTurma && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold px-2 py-1 bg-indigo-100 text-indigo-700 rounded uppercase tracking-wider italic">
                    {activeDisciplina}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-1 bg-green-100 text-green-700 rounded uppercase tracking-wider">
                    Conectado
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <AnimatePresence mode="wait">
                {!activeTurma ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full p-20 text-center space-y-4"
                  >
                    <BookOpen className="w-12 h-12 text-slate-200" />
                    <p className="text-sm font-medium text-slate-500 italic">Nenhuma turma selecionada para visualização.</p>
                  </motion.div>
                ) : (
                  <motion.table 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full text-left"
                  >
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="bg-white border-b border-slate-100">
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-6">Aluno</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center">Av I</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center">Av II</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center">Av III</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center">Av IV</th>
                        <th className="p-4 text-[10px] font-bold text-slate-700 uppercase text-center bg-slate-50">Total</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center">Status</th>
                        <th className="p-4 text-[10px] font-bold text-slate-400 uppercase text-center w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-slate-600 divide-y divide-slate-50">
                      {data.classes[activeTurma]?.map((student) => {
                        const metrics = calculateMetrics(student);
                        const grades = (student.grades[activeDisciplina] || {})[activeUnidade] || { a1: 0, a2: 0, a3: 0, a4: 0 };
                        
                        return (
                          <tr key={student.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                            <td className="p-4 pl-6 font-medium text-slate-800">{student.name}</td>
                            <td className="p-2 text-center">
                              <input 
                                type="number" 
                                value={grades.a1 || ''} 
                                onChange={(e) => updateGrade(student.id, 'a1', e.target.value)}
                                className="w-12 h-9 text-center rounded-md bg-white border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input 
                                type="number" 
                                value={grades.a2 || ''} 
                                onChange={(e) => updateGrade(student.id, 'a2', e.target.value)}
                                className="w-12 h-9 text-center rounded-md bg-white border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input 
                                type="number" 
                                value={grades.a3 || ''} 
                                onChange={(e) => updateGrade(student.id, 'a3', e.target.value)}
                                className="w-12 h-9 text-center rounded-md bg-white border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input 
                                type="number" 
                                value={grades.a4 || ''} 
                                onChange={(e) => updateGrade(student.id, 'a4', e.target.value)}
                                className="w-12 h-9 text-center rounded-md bg-white border border-slate-200 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </td>
                            <td className="p-4 text-center bg-slate-50 font-black text-slate-900 text-xs">{metrics.totalUnidade.toFixed(1)}</td>
                            <td className="p-4 text-center">
                              {metrics.isAprovado ? (
                                <div className="flex flex-col items-center gap-1">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                  <span className="text-[8px] text-emerald-600 font-bold uppercase">Aprovado</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                  <span className="text-[8px] text-amber-600 font-bold uppercase">Reprovado</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => removeStudent(student.id, student.name)}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Remover Estudante"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </motion.table>
                )}
              </AnimatePresence>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Alunos na turma: <span className="font-bold text-slate-700">{data.classes[activeTurma]?.length || 0}</span>
              </p>
              <div className="flex space-x-3">
                {activeTurma && (
                  <>
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                    >
                      <Download className="w-4 h-4" /> Exportar Unidade
                    </button>
                    <button 
                      onClick={exportBoletimPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-teal-100 hover:bg-teal-700 transition-all active:scale-95"
                    >
                      <Download className="w-4 h-4" /> Exportar Boletim Geral
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Save Notification Toast */}
      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-12 right-8 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 pointer-events-none"
          >
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold">Salvo com sucesso</p>
              <p className="text-xs text-slate-300">Alterações sincronizadas no dispositivo</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Status Bar */}
      <footer className="bg-white border-t border-slate-200 px-8 py-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-400 font-bold z-10 flex-col md:flex-row gap-2 md:gap-0">
        <div className="flex space-x-6">
          <span>Versão 2.6.0</span>
          <span className="hidden sm:inline">Conectado: Local Storage Sync</span>
        </div>
        <div className="text-center">
          Desenvolvido para os(as) colegas professores(as) pelo Profº Sérgio Araújo . 2026
        </div>
        <div className="flex items-center hidden sm:flex">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
          Sistemas Operacionais
        </div>
      </footer>
    </div>
  );
}

// ============ CONFIGURAÇÃO DO SHEET.BEST ============
const SHEETBEST_URL =
  "https://api.sheetbest.com/sheets/e8992b96-6649-4752-b909-87a60b00213b";

// ============ VARIÁVEIS DO SISTEMA ============
let rifaData = [];
let userRole = "vendedor";
let selectedNumbers = [];
let isModeratorLoggedIn = false;
let usuarioLogado = null;
let isConnected = false;
let isProcessing = false;

// Lista de usuários autorizados (NÃO VISÍVEL PARA VENDEDORES)
const usuariosAutorizados = [
  { usuario: "leonardo", senha: "leo123", nome: "Leonardo" },
  { usuario: "shirlei", senha: "shir456", nome: "Shirlei" },
  { usuario: "lucas", senha: "luk789", nome: "Lucas" },
  { usuario: "rafaela", senha: "rafa000", nome: "Rafaela" },
  { usuario: "felipe", senha: "feli555", nome: "Felipe" },
  { usuario: "simone", senha: "sim111", nome: "Simone" },
  { usuario: "ewerton", senha: "ewer222", nome: "Ewerton" },
  { usuario: "maria", senha: "inez333", nome: "Maria Inez" },
];

// ============ FUNÇÕES DE CONTROLE DE INTERFACE ============

// Atualizar interface baseada no papel do usuário
function atualizarInterfacePorPapel() {
  const titulo = document.getElementById("painelTitulo");
  const secaoStatus = document.getElementById("secaoStatusModerador");
  const btnConfirmar = document.getElementById("btnConfirmarPagamento");
  const btnCancelar = document.getElementById("btnCancelarReserva");
  const infoModerador = document.getElementById("infoModerador");

  if (userRole === "moderador") {
    titulo.textContent = "Painel do Moderador";
    if (secaoStatus) secaoStatus.classList.remove("hidden");
    if (btnConfirmar) btnConfirmar.classList.remove("hidden");
    if (btnCancelar) btnCancelar.classList.remove("hidden");
    if (infoModerador) infoModerador.classList.remove("hidden");
  } else {
    titulo.textContent = "Painel do Vendedor";
    if (secaoStatus) secaoStatus.classList.add("hidden");
    if (btnConfirmar) btnConfirmar.classList.add("hidden");
    if (btnCancelar) btnCancelar.classList.add("hidden");
    if (infoModerador) infoModerador.classList.add("hidden");
  }
}

// Atualizar campos quando número for selecionado
function atualizarCamposAoSelecionar() {
  if (selectedNumbers.length === 1) {
    const numero = selectedNumbers[0];
    const item = rifaData.find((item) => item.numero === numero);

    if (item) {
      // Preencher campos básicos (para reserva)
      document.getElementById("nomeComprador").value = item.comprador || "";
      document.getElementById("nomeVendedor").value = item.vendedor || "";

      // Atualizar display para moderador
      if (userRole === "moderador") {
        document.getElementById("displayStatus").textContent = item.status;
        document.getElementById("displayPagamento").textContent =
          item.pagamento;

        // Habilitar/desabilitar botões do moderador
        const btnConfirmar = document.getElementById("btnConfirmarPagamento");
        const btnCancelar = document.getElementById("btnCancelarReserva");

        if (btnConfirmar) {
          btnConfirmar.disabled = !(
            item.status === "Reservado" && item.pagamento === "Não"
          );
          btnConfirmar.title =
            item.status === "Reservado"
              ? "Confirmar pagamento deste número"
              : "Apenas números reservados podem ter pagamento confirmado";
        }

        if (btnCancelar) {
          btnCancelar.disabled = item.status === "Cancelado";
          btnCancelar.title =
            item.status === "Cancelado"
              ? "Número já cancelado"
              : "Cancelar reserva deste número";
        }
      }
    }
  } else if (selectedNumbers.length > 1) {
    // Se múltiplos números, limpar campos
    document.getElementById("nomeComprador").value = "";
    document.getElementById("nomeVendedor").value = "";

    // Desabilitar botões do moderador para múltipla seleção
    if (userRole === "moderador") {
      const btnConfirmar = document.getElementById("btnConfirmarPagamento");
      const btnCancelar = document.getElementById("btnCancelarReserva");

      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.title =
          "Selecione apenas um número para confirmar pagamento";
      }

      if (btnCancelar) {
        btnCancelar.disabled = true;
        btnCancelar.title = "Selecione apenas um número para cancelar";
      }
    }
  }
}

// ============ SHEET.BEST - FUNÇÕES ============

// ENCONTRAR ID DA LINHA PELO NÚMERO
async function findRowIdByNumber(numero) {
  try {
    const response = await fetch(SHEETBEST_URL);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNumber = parseInt(row["Número"] || row["número"] || 0);

          if (rowNumber === numero) {
            return row.id || `row${i + 2}`;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.log("Busca por número falhou:", error);
    return null;
  }
}

// SALVAR/ATUALIZAR NA PLANILHA
async function saveToSheet(numero, data, skipDuplicationCheck = false) {
  console.log(`💾 Salvando número ${numero}...`);

  // SÓ fazer verificação de duplicidade se solicitado
  if (!skipDuplicationCheck) {
    const existingItem = rifaData.find((item) => item.numero === numero);

    // Verificação mais completa - não apenas status e pagamento
    if (
      existingItem &&
      existingItem.status === data.status &&
      existingItem.comprador === data.comprador &&
      existingItem.vendedor === data.vendedor &&
      existingItem.pagamento === data.pagamento &&
      existingItem.autorizadoPor === data.autorizadoPor
    ) {
      console.log(
        `⚠️ Número ${numero} já está atualizado localmente. Ignorando...`,
      );
      // Mas ainda tenta salvar na planilha para garantir sincronização
      // return true; // NÃO RETORNAR AQUI - sempre tenta salvar na planilha
    }
  }

  try {
    const sheetData = {
      Número: numero.toString(),
      Status: data.status || "Disponível",
      "Nome do Comprador": data.comprador || "",
      "Nome do Vendedor": data.vendedor || "",
      "Nome do moderador": data.autorizadoPor || "",
      Pagamento: data.pagamento || "Não",
      Data: data.dataRegistro || new Date().toLocaleDateString("pt-BR"),
      Observações: data.observacoes || "",
    };

    const rowId = await findRowIdByNumber(numero);

    if (rowId) {
      // ATUALIZAR linha existente
      const updateUrl = `${SHEETBEST_URL}/${rowId}`;

      const response = await fetch(updateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sheetData),
      });

      if (response.ok) {
        console.log("✅ Linha atualizada na planilha");
        return true;
      } else {
        console.warn(
          `⚠️ Não foi possível atualizar linha ${rowId}, tentando criar nova...`,
        );
      }
    }

    // CRIAR nova linha (se não encontrou ou não conseguiu atualizar)
    const response = await fetch(SHEETBEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sheetData),
    });

    if (response.ok) {
      console.log("✅ Nova linha criada na planilha");
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("❌ Erro ao salvar na planilha:", error);
    showNotification(
      `Erro ao salvar número ${numero}: ${error.message}`,
      "error",
    );
    return false;
  }
}

// ============ CARREGAR DADOS DA PLANILHA ============

async function loadDataFromSheet() {
  try {
    const response = await fetch(SHEETBEST_URL);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (data && Array.isArray(data)) {
      processSheetData(data);
      updateConnectionStatus(true);
      showNotification("Dados carregados com sucesso!", "success");
      return true;
    } else {
      initRifaData();
      updateConnectionStatus(true);
      return true;
    }
  } catch (error) {
    console.error("❌ Erro ao carregar:", error);
    initRifaData();
    updateConnectionStatus(false, "Usando dados locais");
    showNotification("Sem conexão. Usando dados locais...", "warning");
    return false;
  }
}

// Processar dados da planilha
function processSheetData(data) {
  rifaData = [];

  data.forEach((row) => {
    const numero = parseInt(row["Número"] || row["número"] || 0);
    if (numero > 0 && numero <= 360) {
      rifaData.push({
        numero: numero,
        status: row["Status"] || row["status"] || "Disponível",
        comprador: row["Nome do Comprador"] || row["Comprador"] || "",
        vendedor: row["Nome do Vendedor"] || row["Vendedor"] || "",
        pagamento: row["Pagamento"] || row["pagamento"] || "Não",
        dataRegistro: row["Data"] || row["data"] || "",
        observacoes: row["Observações"] || row["observacoes"] || "",
        autorizadoPor: row["Nome do moderador"] || "",
      });
    }
  });

  // Completar números faltantes
  for (let i = 1; i <= 360; i++) {
    if (!rifaData.find((item) => item.numero === i)) {
      rifaData.push({
        numero: i,
        status: "Disponível",
        comprador: "",
        vendedor: "",
        pagamento: "Não",
        dataRegistro: "",
        observacoes: "",
        autorizadoPor: "",
      });
    }
  }

  // Ordenar
  rifaData.sort((a, b) => a.numero - b.numero);

  updateCounters();
  generateRifaGrid();
}

// Inicializar dados da rifa
function initRifaData() {
  rifaData = [];
  for (let i = 1; i <= 360; i++) {
    rifaData.push({
      numero: i,
      status: "Disponível",
      comprador: "",
      vendedor: "",
      pagamento: "Não",
      dataRegistro: "",
      observacoes: "",
      autorizadoPor: "",
    });
  }

  updateCounters();
  generateRifaGrid();
}

// ============ FUNÇÕES DA INTERFACE ============

// Atualizar status da conexão
function updateConnectionStatus(connected, message = "") {
  isConnected = connected;
  const statusElement = document.getElementById("statusConexao");

  if (connected) {
    statusElement.className = "status-conexao conectado";
    statusElement.innerHTML = `<i class="fas fa-plug"></i> Conectado ao Sheet.best`;
    statusElement.classList.remove("hidden");
  } else {
    statusElement.className = "status-conexao desconectado";
    statusElement.innerHTML = `<i class="fas fa-plug"></i> Desconectado${message ? ` - ${message}` : ""}`;
    statusElement.classList.remove("hidden");
  }
}

// Atualizar painel de seleção múltipla
function updateSelecaoMultiplaPanel() {
  const painel = document.getElementById("painelSelecaoMultipla");
  const lista = document.getElementById("numerosSelecionadosLista");
  const campoNumeros = document.getElementById("numeroSelecionado");

  if (selectedNumbers.length > 0) {
    painel.classList.remove("hidden");
    lista.innerHTML = "";

    selectedNumbers.forEach((numero) => {
      const span = document.createElement("span");
      span.className = "numero-selecionado";
      span.textContent = numero;
      lista.appendChild(span);
    });

    // ATUALIZAR O CAMPO DE NÚMEROS EM AMBOS OS MODOS
    campoNumeros.value = selectedNumbers.join(", ");
  } else {
    painel.classList.add("hidden");
    campoNumeros.value = "";
  }
}

// Mostrar notificação
function showNotification(message, type = "info") {
  const colors = {
    success: "#4CAF50",
    error: "#f44336",
    warning: "#ff9800",
    info: "#2196F3",
  };

  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || "#2196F3"};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 300px;
    animation: slideIn 0.3s ease;
    font-family: 'Segoe UI', Arial, sans-serif;
  `;

  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : type === "warning" ? "exclamation-triangle" : "info-circle"}" 
         style="font-size: 1.2em;"></i>
      <div style="font-size: 0.9em;">${message}</div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Atualizar contadores
function updateCounters() {
  const disponivel = rifaData.filter(
    (item) => item.status === "Disponível",
  ).length;
  const reservado = rifaData.filter(
    (item) => item.status === "Reservado",
  ).length;
  const vendido = rifaData.filter((item) => item.status === "Vendido").length;
  const cancelado = rifaData.filter(
    (item) => item.status === "Cancelado",
  ).length;

  document.getElementById("disponivelCount").textContent = disponivel;
  document.getElementById("reservadoCount").textContent = reservado;
  document.getElementById("vendidoCount").textContent = vendido;
  document.getElementById("canceladoCount").textContent = cancelado;
}

// ============ GRID DE NÚMEROS ============

// Gerar grid de números
function generateRifaGrid() {
  const grid = document.getElementById("rifaGrid");
  grid.innerHTML = "";

  const filter = document.querySelector(".filter-btn.active").dataset.filter;
  const search = document.getElementById("searchInput").value.toLowerCase();

  rifaData.forEach((item) => {
    // Aplicar filtro
    if (filter !== "todos") {
      const statusLower = item.status.toLowerCase();
      const filterMap = {
        disponivel: "disponível",
        reservado: "reservado",
        vendido: "vendido",
        cancelado: "cancelado",
      };

      if (filterMap[filter] && statusLower !== filterMap[filter]) {
        return;
      }
    }

    // Aplicar busca
    if (search) {
      const matchNumero = item.numero.toString().includes(search);
      const matchComprador = item.comprador.toLowerCase().includes(search);
      const matchVendedor = item.vendedor.toLowerCase().includes(search);
      const matchAutorizadoPor = (item.autorizadoPor || "")
        .toLowerCase()
        .includes(search);

      if (
        !matchNumero &&
        !matchComprador &&
        !matchVendedor &&
        !matchAutorizadoPor
      ) {
        return;
      }
    }

    // Criar elemento
    const div = document.createElement("div");
    div.className = `numero-rifa ${item.status.toLowerCase()}`;

    // Adicionar classe 'selecionado' se o número estiver na lista
    if (selectedNumbers.includes(item.numero)) {
      div.classList.add("selecionado");
    }

    div.dataset.numero = item.numero;
    div.title = item.observacoes || "";

    let statusText = "";
    switch (item.status) {
      case "Reservado":
        statusText = "RESERVADO";
        break;
      case "Vendido":
        statusText = "VENDIDO";
        break;
      case "Cancelado":
        statusText = "CANCELADO";
        break;
      default:
        statusText = "DISPONÍVEL";
    }

    div.innerHTML = `
        <div class="numero">${item.numero}</div>
        <div class="status-badge">${statusText}</div>
        ${item.comprador ? `<small>${item.comprador}</small>` : ""}
        ${item.autorizadoPor ? `<small style="font-size: 0.6rem; color: #666;">Aut: ${item.autorizadoPor}</small>` : ""}
    `;

    // Evento de clique
    div.addEventListener("click", function () {
      if (userRole === "vendedor") {
        if (item.status === "Disponível" || item.status === "Cancelado") {
          toggleSelectNumber(item.numero);
        } else {
          showNotification(
            "Apenas números disponíveis ou cancelados podem ser selecionados",
            "warning",
          );
        }
      } else {
        // MODERADOR pode selecionar QUALQUER número
        toggleSelectNumber(item.numero);
      }
    });

    grid.appendChild(div);
  });
}

// Função para mostrar/ocultar elementos do moderador
function atualizarInterfaceModerador() {
  const secaoModerador = document.getElementById("secaoModerador");
  const btnConfirmar = document.getElementById("btnConfirmarPagamento");
  const btnCancelar = document.getElementById("btnCancelarReserva");

  if (userRole === "moderador") {
    if (secaoModerador) secaoModerador.classList.remove("hidden");
    if (btnConfirmar) btnConfirmar.classList.remove("hidden");
    if (btnCancelar) btnCancelar.classList.remove("hidden");
    document.getElementById("painelTitulo").textContent = "Painel do Moderador";
  } else {
    if (secaoModerador) secaoModerador.classList.add("hidden");
    if (btnConfirmar) btnConfirmar.classList.add("hidden");
    if (btnCancelar) btnCancelar.classList.add("hidden");
    document.getElementById("painelTitulo").textContent = "Painel do Vendedor";
  }
}

// Selecionar/deselecionar número (para múltipla seleção)
function toggleSelectNumber(numero) {
  const index = selectedNumbers.indexOf(numero);

  if (index === -1) {
    selectedNumbers.push(numero);
  } else {
    selectedNumbers.splice(index, 1);
  }

  updateSelecaoMultiplaPanel();
  generateRifaGrid();
  atualizarCamposAoSelecionar();
}

// Selecionar um único número (para moderador)
function selectSingleNumber(numero) {
  selectedNumbers = [numero];
  updateSelecaoMultiplaPanel();

  const item = rifaData.find((item) => item.numero === numero);
  if (item && userRole === "moderador") {
    // Preencher os campos do moderador
    document.getElementById("modNumero").value = numero;
    document.getElementById("modComprador").value = item.comprador;
    document.getElementById("modVendedor").value = item.vendedor;
    document.getElementById("modStatus").value = item.status;
    document.getElementById("modPagamento").value = item.pagamento;

    // Habilitar/desabilitar botões baseado no status
    const btnConfirmar = document.getElementById("btnConfirmarPagamento");
    const btnCancelar = document.getElementById("btnCancelarReserva");

    // Só pode confirmar pagamento se estiver Reservado
    if (item.status === "Reservado" && item.pagamento === "Não") {
      btnConfirmar.disabled = false;
      btnConfirmar.title = "Confirmar pagamento";
    } else {
      btnConfirmar.disabled = true;
      btnConfirmar.title =
        item.status === "Vendido"
          ? "Pagamento já confirmado"
          : "Apenas números reservados";
    }

    // Só pode cancelar se não estiver já cancelado ou vendido confirmado
    if (item.status === "Cancelado") {
      btnCancelar.disabled = true;
      btnCancelar.title = "Número já cancelado";
    } else if (item.status === "Vendido" && item.pagamento === "Sim") {
      btnCancelar.disabled = true;
      btnCancelar.title = "Não pode cancelar venda confirmada";
    } else {
      btnCancelar.disabled = false;
      btnCancelar.title = "Cancelar reserva";
    }
  }

  generateRifaGrid();
}

// Limpar seleção
function clearSelection() {
  selectedNumbers = [];
  updateSelecaoMultiplaPanel();

  // Limpar campos básicos
  document.getElementById("nomeComprador").value = "";
  document.getElementById("nomeVendedor").value = "";

  // Limpar display do moderador
  if (userRole === "moderador") {
    document.getElementById("displayStatus").textContent = "Disponível";
    document.getElementById("displayPagamento").textContent = "Não";

    // Desabilitar botões do moderador
    const btnConfirmar = document.getElementById("btnConfirmarPagamento");
    const btnCancelar = document.getElementById("btnCancelarReserva");
    if (btnConfirmar) btnConfirmar.disabled = true;
    if (btnCancelar) btnCancelar.disabled = true;
  }

  generateRifaGrid();
}

// ============ FUNÇÕES DE AÇÃO ============

// VENDEDOR: Reservar números
async function reserveNumbers() {
  if (isProcessing) {
    showNotification("Aguarde, processamento em andamento...", "warning");
    return;
  }

  if (selectedNumbers.length === 0) {
    alert("Selecione pelo menos um número primeiro.");
    return;
  }

  const comprador = document.getElementById("nomeComprador").value.trim();
  const vendedor = document.getElementById("nomeVendedor").value.trim();

  if (!comprador || !vendedor) {
    alert("Preencha o nome do comprador e do vendedor.");
    return;
  }

  // Verificar se os números estão disponíveis (regras diferentes por usuário)
  const numerosIndisponiveis = [];
  selectedNumbers.forEach((numero) => {
    const item = rifaData.find((item) => item.numero === numero);

    if (userRole === "vendedor") {
      // VENDEDOR só pode reservar Disponível ou Cancelado
      if (item && item.status !== "Disponível" && item.status !== "Cancelado") {
        numerosIndisponiveis.push(numero);
      }
    } else {
      // MODERADOR pode reservar qualquer número EXCETO Vendido confirmado
      if (item && item.status === "Vendido" && item.pagamento === "Sim") {
        numerosIndisponiveis.push(numero);
      }
    }
  });

  if (numerosIndisponiveis.length > 0) {
    alert(
      `Os seguintes números não podem ser reservados: ${numerosIndisponiveis.join(", ")}`,
    );
    return;
  }

  // Resto da função continua igual...
  // Ativar bloqueio de processamento
  isProcessing = true;

  // Desabilitar botão durante processamento
  const btnReservar = document.getElementById("btnReservar");
  const originalText = btnReservar.innerHTML;
  btnReservar.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Processando...';
  btnReservar.disabled = true;

  try {
    const results = await Promise.all(
      selectedNumbers.map(async (numero) => {
        const item = rifaData.find((item) => item.numero === numero);

        // Se for número cancelado, reativa primeiro
        if (item && item.status === "Cancelado") {
          const dadosReativacao = {
            status: "Disponível",
            comprador: "",
            vendedor: "",
            pagamento: "Não",
            dataRegistro: new Date().toLocaleDateString("pt-BR"),
            observacoes: `Número reativado por ${userRole === "moderador" ? usuarioLogado?.nome || "Moderador" : vendedor} em ${new Date().toLocaleString("pt-BR")}`,
            autorizadoPor:
              userRole === "moderador"
                ? usuarioLogado?.nome || "Moderador"
                : "",
          };
          await saveToSheet(numero, dadosReativacao, true);
        }

        const dados = {
          numero: numero,
          status: "Reservado",
          comprador: comprador,
          vendedor: vendedor,
          pagamento: "Não",
          dataRegistro: new Date().toLocaleDateString("pt-BR"),
          observacoes: `Reservado por ${vendedor} (${userRole}) em ${new Date().toLocaleString("pt-BR")}`,
          autorizadoPor:
            userRole === "moderador" ? usuarioLogado?.nome || "Moderador" : "",
        };

        // Salva na planilha
        const salvo = await saveToSheet(dados.numero, dados, true);

        if (salvo) {
          // Atualiza localmente
          const item = rifaData.find((item) => item.numero === dados.numero);
          if (item) {
            item.status = dados.status;
            item.comprador = dados.comprador;
            item.vendedor = dados.vendedor;
            item.pagamento = dados.pagamento;
            item.dataRegistro = dados.dataRegistro;
            item.observacoes = dados.observacoes;
            item.autorizadoPor = dados.autorizadoPor;
          }
        }

        return { numero: numero, success: salvo };
      }),
    );

    const successCount = results.filter((r) => r.success === true).length;

    if (successCount === selectedNumbers.length) {
      showNotification(
        `${selectedNumbers.length} número(s) reservado(s) com sucesso para ${comprador}!`,
        "success",
      );
    } else if (successCount > 0) {
      showNotification(
        `${successCount} de ${selectedNumbers.length} número(s) reservado(s) com sucesso`,
        "warning",
      );
    } else {
      showNotification("Falha ao reservar números. Tente novamente.", "error");
    }

    updateCounters();
    generateRifaGrid();
    clearSelection();
  } catch (error) {
    console.error("Erro ao reservar números:", error);
    showNotification("Erro ao processar reserva", "error");
  } finally {
    // Sempre liberar o bloqueio
    isProcessing = false;
    btnReservar.innerHTML = originalText;
    btnReservar.disabled = false;
  }
}

// ============ ADICIONE ESTA FUNÇÃO PARA LIMPAR CORRETAMENTE ============

function limparCamposReserva() {
  document.getElementById("nomeComprador").value = "";
  document.getElementById("nomeVendedor").value = "";
  clearSelection();
}

// FUNÇÃO ESPECÍFICA PARA REATIVAR NÚMERO CANCELADO
async function reativarNumeroCancelado(numero) {
  const item = rifaData.find((item) => item.numero === numero);
  if (!item) return false;

  // Se o número está cancelado, reativa como disponível
  if (item.status === "Cancelado") {
    const dadosReativacao = {
      status: "Disponível",
      comprador: "", // Limpa o comprador
      vendedor: "", // Limpa o vendedor
      pagamento: "Não",
      dataRegistro: new Date().toLocaleDateString("pt-BR"),
      observacoes: `Número reativado por sistema em ${new Date().toLocaleString("pt-BR")}`,
      autorizadoPor: "Sistema",
    };

    const salvo = await saveToSheet(numero, dadosReativacao, true);
    if (salvo) {
      item.status = "Disponível";
      item.comprador = "";
      item.vendedor = "";
      item.observacoes = dadosReativacao.observacoes;
      return true;
    }
    return false;
  }
  return false;
}

// MODERADOR: Confirmar pagamento
async function confirmarPagamento() {
  // Verificar se já está processando
  if (isProcessing) {
    showNotification("Aguarde, processamento em andamento...", "warning");
    return;
  }

  if (selectedNumbers.length === 0) {
    alert("Selecione um número primeiro.");
    return;
  }

  const numero = selectedNumbers[0];
  const item = rifaData.find((item) => item.numero === numero);

  if (!item) return;

  // Verificar se o pagamento já foi confirmado anteriormente
  if (item.status === "Vendido" && item.pagamento === "Sim") {
    showNotification(
      `O número ${numero} já teve pagamento confirmado!`,
      "warning",
    );
    return;
  }

  // Ativar bloqueio de processamento
  isProcessing = true;

  // Desabilitar botão durante processamento
  const btnConfirmar = document.getElementById("btnConfirmarPagamento");
  const originalText = btnConfirmar.innerHTML;
  btnConfirmar.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Processando...';
  btnConfirmar.disabled = true;

  const moderadorNome = usuarioLogado ? usuarioLogado.nome : "Desconhecido";
  const dataConfirmacao = new Date().toLocaleString("pt-BR");

  // DADOS PARA SALVAR (antes de modificar localmente)
  const dadosParaSalvar = {
    numero: numero,
    status: "Vendido",
    comprador: item.comprador, // Mantém o comprador existente
    vendedor: item.vendedor, // Mantém o vendedor existente
    pagamento: "Sim",
    dataRegistro: item.dataRegistro || new Date().toLocaleDateString("pt-BR"),
    observacoes: `Pagamento confirmado por ${moderadorNome} em ${dataConfirmacao}`,
    autorizadoPor: moderadorNome,
  };

  try {
    // PRIMEIRO salva na planilha
    const salvo = await saveToSheet(numero, dadosParaSalvar, true);

    if (salvo) {
      // DEPOIS atualiza localmente
      item.status = dadosParaSalvar.status;
      item.pagamento = dadosParaSalvar.pagamento;
      item.autorizadoPor = dadosParaSalvar.autorizadoPor;
      item.observacoes = dadosParaSalvar.observacoes;

      showNotification(`Pagamento confirmado para número ${numero}`, "success");
      updateCounters();
      generateRifaGrid();

      // Limpar seleção após sucesso
      clearSelection();
    }
  } catch (error) {
    console.error("Erro ao confirmar pagamento:", error);
    showNotification("Erro ao processar pagamento", "error");
  } finally {
    // Sempre liberar o bloqueio, mesmo se houver erro
    isProcessing = false;
    btnConfirmar.innerHTML = originalText;
    btnConfirmar.disabled = false;
  }
}

// MODERADOR: Cancelar reserva
async function cancelarReserva() {
  // Verificar se já está processando
  if (isProcessing) {
    showNotification("Aguarde, processamento em andamento...", "warning");
    return;
  }

  if (selectedNumbers.length === 0) {
    alert("Selecione um número primeiro.");
    return;
  }

  const numero = selectedNumbers[0];
  const item = rifaData.find((item) => item.numero === numero);

  if (!item) return;

  if (item.status === "Disponível") {
    alert("Este número já está disponível.");
    return;
  }

  if (item.status === "Cancelado") {
    showNotification(`O número ${numero} já está cancelado!`, "warning");
    return;
  }

  if (
    !confirm(`Tem certeza que deseja cancelar a reserva do número ${numero}?`)
  ) {
    return;
  }

  // Ativar bloqueio de processamento
  isProcessing = true;

  // Desabilitar botão durante processamento
  const btnCancelar = document.getElementById("btnCancelarReserva");
  const originalText = btnCancelar.innerHTML;
  btnCancelar.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Processando...';
  btnCancelar.disabled = true;

  const moderadorNome = usuarioLogado ? usuarioLogado.nome : "Desconhecido";
  const dataCancelamento = new Date().toLocaleString("pt-BR");

  // DADOS PARA SALVAR (antes de modificar localmente)
  const dadosParaSalvar = {
    numero: numero,
    status: "Cancelado",
    comprador: item.comprador, // Mantém para histórico
    vendedor: item.vendedor, // Mantém para histórico
    pagamento: "Não",
    dataRegistro: item.dataRegistro || new Date().toLocaleDateString("pt-BR"),
    observacoes: `Reserva cancelada por ${moderadorNome} em ${dataCancelamento}. Comprador: ${item.comprador}, Vendedor: ${item.vendedor}`,
    autorizadoPor: moderadorNome,
  };

  try {
    // PRIMEIRO salva na planilha
    const salvo = await saveToSheet(numero, dadosParaSalvar, true);

    if (salvo) {
      // DEPOIS atualiza localmente
      item.status = dadosParaSalvar.status;
      item.pagamento = dadosParaSalvar.pagamento;
      item.autorizadoPor = dadosParaSalvar.autorizadoPor;
      item.observacoes = dadosParaSalvar.observacoes;

      showNotification(`Reserva cancelada para número ${numero}`, "success");
      updateCounters();
      generateRifaGrid();
      clearSelection();
    }
  } catch (error) {
    console.error("Erro ao cancelar reserva:", error);
    showNotification("Erro ao processar cancelamento", "error");
  } finally {
    // Sempre liberar o bloqueio
    isProcessing = false;
    btnCancelar.innerHTML = originalText;
    btnCancelar.disabled = false;
  }
}

// ============ FUNÇÕES DO SISTEMA ============

// Alternar entre vendedor e moderador
function toggleUserRole(role) {
  userRole = role;

  // Atualizar botões
  document
    .getElementById("btnVendedor")
    .classList.toggle("active", role === "vendedor");
  document
    .getElementById("btnModerador")
    .classList.toggle("active", role === "moderador");

  // Atualizar interface
  atualizarInterfacePorPapel();

  // Limpar seleção
  clearSelection();
}

// ============ SISTEMA DE LOGIN ============

// Mostrar modal de login para moderador
function showLoginModal() {
  document.getElementById("loginModal").classList.remove("hidden");
  document.getElementById("loginUsuario").focus();
}

// Fechar modal de login
function closeLoginModal() {
  document.getElementById("loginModal").classList.add("hidden");
  document.getElementById("loginUsuario").value = "";
  document.getElementById("loginSenha").value = "";
  document.getElementById("loginError").textContent = "";
}

// Login do moderador
function loginModerator() {
  const usuario = document.getElementById("loginUsuario").value.trim();
  const senha = document.getElementById("loginSenha").value.trim();
  const errorElement = document.getElementById("loginError");

  errorElement.textContent = "";

  if (!usuario || !senha) {
    errorElement.textContent = "Preencha todos os campos.";
    return;
  }

  usuarioLogado = usuariosAutorizados.find(
    (user) => user.usuario === usuario && user.senha === senha,
  );

  if (usuarioLogado) {
    isModeratorLoggedIn = true;
    closeLoginModal();
    toggleUserRole("moderador");
    updateLoginUI();

    showNotification(`Bem-vindo(a), ${usuarioLogado.nome}!`, "success");
  } else {
    errorElement.textContent = "Usuário ou senha incorretos.";
  }
}

// Logout do moderador
function logoutModerator() {
  isModeratorLoggedIn = false;
  usuarioLogado = null;
  toggleUserRole("vendedor");
  updateLoginUI();

  showNotification("Modo moderador encerrado.", "info");
}

// Atualizar interface do login
function updateLoginUI() {
  const logoutBtn = document.getElementById("btnLogout");
  const userIndicator = document.getElementById("userIndicator");

  if (isModeratorLoggedIn && usuarioLogado) {
    logoutBtn.style.display = "block";
    userIndicator.textContent = `Modo: Moderador (${usuarioLogado.nome})`;
  } else {
    logoutBtn.style.display = "none";
    userIndicator.textContent = "Modo: Vendedor";
  }
}

// Função para criar debounce (evitar múltiplos cliques rápidos)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Função para forçar salvamento (debug)
async function forceSaveToSheet(numero) {
  const item = rifaData.find((item) => item.numero === numero);
  if (!item) {
    console.error(`Número ${numero} não encontrado`);
    return false;
  }

  console.log(`🔧 Forçando salvamento do número ${numero}...`);
  return await saveToSheet(numero, item, true);
}

// Adicionar ao console para testes
window.forceSave = forceSaveToSheet;

// ============ INICIALIZAÇÃO ============

document.addEventListener("DOMContentLoaded", async function () {
  // Iniciar como vendedor
  initRifaData();
  updateLoginUI();
  atualizarInterfacePorPapel();

  // Event Listeners para login/logout
  document
    .getElementById("btnEntrar")
    .addEventListener("click", loginModerator);
  document
    .getElementById("btnCancelarLogin")
    .addEventListener("click", closeLoginModal);
  document
    .getElementById("btnLogout")
    .addEventListener("click", logoutModerator);
  document
    .getElementById("btnReservar")
    .addEventListener("click", reserveNumbers);
  document
    .getElementById("btnLimpar")
    .addEventListener("click", limparCamposReserva);

  // Permitir login com Enter
  document
    .getElementById("loginSenha")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        loginModerator();
      }
    });

  // Event Listeners para papéis
  document.getElementById("btnVendedor").addEventListener("click", () => {
    if (userRole !== "vendedor") {
      toggleUserRole("vendedor");
    }
  });

  document.getElementById("btnModerador").addEventListener("click", () => {
    if (userRole === "vendedor") {
      // Se está como vendedor e clica em moderador, pede login
      showLoginModal();
    } else if (userRole === "moderador") {
      // Se já está como moderador e clica novamente, não faz nada
      return;
    }
  });

  // Vendedor - com debounce de 500ms
  document
    .getElementById("btnReservar")
    .addEventListener("click", debounce(reserveNumbers, 500));

  // Moderador - com debounce de 500ms
  document
    .getElementById("btnConfirmarPagamento")
    .addEventListener("click", debounce(confirmarPagamento, 500));
  document
    .getElementById("btnCancelarReserva")
    .addEventListener("click", debounce(cancelarReserva, 500));

  // Vendedor
  document
    .getElementById("btnLimpar")
    .addEventListener("click", clearSelection);
  document
    .getElementById("btnLimparSelecao")
    .addEventListener("click", clearSelection);

  // Filtros
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      generateRifaGrid();
    });
  });

  // Busca
  document
    .getElementById("searchInput")
    .addEventListener("input", generateRifaGrid);

  // Carregar dados do Sheet.best após inicialização
  setTimeout(async () => {
    await loadDataFromSheet();
  }, 500);
});

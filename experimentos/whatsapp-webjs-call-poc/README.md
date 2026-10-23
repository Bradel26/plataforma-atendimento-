# WhatsApp Web: prova de conceito local

Experimento isolado para avaliar mensagens e chamadas do WhatsApp Web. O painel aparece dentro do Atendimento local e usa um servico local separado; nao usa a Cloud API da Meta, o banco, nem o CRM.

## Iniciar

1. Inicie a plataforma local como de costume (`npm run dev` na raiz).
2. Em outro terminal, inicie este servico:

   ```powershell
   cd experimentos/whatsapp-webjs-call-poc
   npm start
   ```

3. Neste mesmo computador, abra `http://127.0.0.1:5173/atendimento` e clique em **Testar chamadas WhatsApp (local)**.
4. Conecte uma linha de teste lendo o QR em WhatsApp > Aparelhos conectados.

O endereco `127.0.0.1` permite ao navegador solicitar acesso ao microfone. O acesso pelo IP da rede local pode bloquear essa permissao por nao usar HTTPS.

## Escopo e limites

- A sessao fica em `.auth/` e as gravacoes WAV em `recordings/`; os dois caminhos sao ignorados pelo Git.
- As mensagens e chamadas deste painel ainda nao entram na caixa de entrada da plataforma, nao sao persistidas no banco e nao aparecem no CRM.
- Grave apenas com consentimento dos participantes. Use somente uma linha de teste, nunca um numero critico de vendas.
- O controle de chamadas depende de uma alteracao experimental do whatsapp-web.js e pode parar de funcionar quando o WhatsApp Web mudar. Nao use em producao.

(() => {
  const MAX_LENGTH = 2000;
  const WARNING_THRESHOLD = 1800;

  const form = document.getElementById('ai-ask-form');
  const questionInput = document.getElementById('question-input');
  const charCount = document.getElementById('char-count');
  const submitButton = document.getElementById('submit-button');
  const clearButton = document.getElementById('clear-button');
  const loadingIndicator = document.getElementById('loading-indicator');
  const errorBox = document.getElementById('error-box');
  const answerSection = document.getElementById('answer-section');
  const answerModel = document.getElementById('answer-model');
  const answerContent = document.getElementById('answer-content');
  const copyButton = document.getElementById('copy-button');

  if (!form || !questionInput) {
    return;
  }

  let isSubmitting = false;
  let lastRawAnswer = '';

  /**
   * 画面のUI状態を一元管理する
   * @param {'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'} state
   */
  function setUiState(state) {
    switch (state) {
      case 'IDLE':
        questionInput.disabled = false;
        submitButton.disabled = false;
        clearButton.disabled = false;
        submitButton.textContent = '質問する';
        loadingIndicator.hidden = true;
        errorBox.hidden = true;
        answerSection.hidden = true;
        break;

      case 'LOADING':
        questionInput.disabled = true;
        submitButton.disabled = true;
        clearButton.disabled = true;
        submitButton.textContent = '送信中...';
        loadingIndicator.hidden = false;
        errorBox.hidden = true;
        break;

      case 'SUCCESS':
        questionInput.disabled = false;
        submitButton.disabled = false;
        clearButton.disabled = false;
        submitButton.textContent = '質問する';
        loadingIndicator.hidden = true;
        errorBox.hidden = true;
        answerSection.hidden = false;
        break;

      case 'ERROR':
        questionInput.disabled = false;
        submitButton.disabled = false;
        clearButton.disabled = false;
        submitButton.textContent = '質問する';
        loadingIndicator.hidden = true;
        errorBox.hidden = false;
        answerSection.hidden = true;
        break;
    }
  }

  /**
   * HTML特殊文字を完全にエスケープする（XSS対策）
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * エスケープ済みの安全な文字列に対して軽量な書式変換を行う
   * @param {string} rawText
   * @returns {string}
   */
  function formatAndSanitizeAnswer(rawText) {
    // 1. 最優先でHTMLエスケープを実施
    const escaped = escapeHtml(rawText);

    // 2. コードブロック（```...```）を一時トークンへ退避（内部の改行を<br>にしないため）
    const codeBlocks = [];
    const withPlaceholders = escaped.replace(
      /```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g,
      (_match, codeBody) => {
        const index = codeBlocks.length;
        codeBlocks.push(`<pre><code>${codeBody.replace(/\n$/, '')}</code></pre>`);
        return `__CODE_BLOCK_${index}__`;
      }
    );

    // 3. インラインコード・太字・改行の変換
    const formatted = withPlaceholders
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    // 4. コードブロックを復元
    return formatted.replace(/__CODE_BLOCK_(\d+)__/g, (_match, indexStr) => {
      return codeBlocks[Number(indexStr)] || '';
    });
  }

  /**
   * 文字数カウンターの更新
   */
  function updateCharCount() {
    const length = questionInput.value.length;
    charCount.textContent = `${length} / ${MAX_LENGTH}`;
    if (length >= WARNING_THRESHOLD) {
      charCount.classList.add('is-warning');
    } else {
      charCount.classList.remove('is-warning');
    }
  }

  /**
   * エラーメッセージの表示
   * @param {string} message
   */
  function showError(message) {
    errorBox.textContent = message;
    setUiState('ERROR');
  }

  // 入力文字数のリアルタイム更新
  questionInput.addEventListener('input', updateCharCount);

  // Ctrl+Enter / Cmd+Enter でのフォーム送信サポート
  questionInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // 質問送信処理
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmed = questionInput.value.trim();

    if (trimmed.length === 0) {
      showError('質問内容を入力してください。');
      questionInput.focus();
      return;
    }

    if (trimmed.length > MAX_LENGTH) {
      showError(`質問は${MAX_LENGTH.toLocaleString()}文字以内で入力してください。`);
      questionInput.focus();
      return;
    }

    isSubmitting = true;
    setUiState('LOADING');

    try {
      const response = await fetch('/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: trimmed }),
      });

      const result = await response.json();

      if (response.ok && result && result.success && result.data) {
        lastRawAnswer = result.data.answer || '';
        answerModel.textContent = result.data.model || '';
        answerContent.innerHTML = formatAndSanitizeAnswer(lastRawAnswer);
        setUiState('SUCCESS');
      } else {
        const message =
          result?.error?.message || 'エラーが発生しました。時間をおいて再度お試しください。';
        showError(message);
      }
    } catch (_error) {
      showError('サーバーとの通信に失敗しました。ネットワーク接続を確認してください。');
    } finally {
      isSubmitting = false;
    }
  });

  // クリアボタン処理
  clearButton.addEventListener('click', () => {
    if (isSubmitting) {
      return;
    }
    questionInput.value = '';
    lastRawAnswer = '';
    answerContent.innerHTML = '';
    answerModel.textContent = '';
    updateCharCount();
    setUiState('IDLE');
    questionInput.focus();
  });

  // 回答コピーボタン処理
  copyButton.addEventListener('click', async () => {
    if (!lastRawAnswer) {
      return;
    }
    try {
      await navigator.clipboard.writeText(lastRawAnswer);
      const originalText = copyButton.textContent;
      copyButton.textContent = 'コピーしました！';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    } catch (_error) {
      showError('クリップボードへのコピーに失敗しました。');
    }
  });

  // 初期状態の反映
  updateCharCount();
})();
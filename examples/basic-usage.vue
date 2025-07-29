<template>
  <div class="example-container">
    <h2>Vue Web Storage 基本使用示例</h2>
    
    <!-- 基本存储操作 -->
    <div class="section">
      <h3>基本存储操作</h3>
      <div class="form-group">
        <input v-model="inputKey" placeholder="输入 key" />
        <input v-model="inputValue" placeholder="输入 value" />
        <button @click="setValue">设置值</button>
        <button @click="getValue">获取值</button>
        <button @click="removeValue">删除值</button>
      </div>
      <div class="result">结果: {{ result }}</div>
    </div>

    <!-- 响应式存储 -->
    <div class="section">
      <h3>响应式存储</h3>
      <div class="form-group">
        <input v-model="reactiveValue" placeholder="响应式值" />
        <button @click="clearReactiveValue">清空</button>
      </div>
      <div class="result">当前值: {{ reactiveValue }}</div>
    </div>

    <!-- 过期时间 -->
    <div class="section">
      <h3>过期时间存储</h3>
      <div class="form-group">
        <input v-model="expireValue" placeholder="过期值" />
        <input v-model.number="expireTime" placeholder="过期时间(秒)" type="number" />
        <button @click="setExpireValue">设置过期值</button>
        <button @click="getExpireValue">获取过期值</button>
      </div>
      <div class="result">过期值: {{ expireResult }}</div>
    </div>

    <!-- 存储统计 -->
    <div class="section">
      <h3>存储统计</h3>
      <button @click="getStats">获取统计信息</button>
      <button @click="clearExpired">清理过期项</button>
      <div class="result">
        <pre>{{ JSON.stringify(stats, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLocalStorage, WebStorage, StorageStats } from '../src';

// 创建存储实例
const storage = new WebStorage({
  prefix: 'example-',
  defaultExpires: 5000 // 默认5秒过期
});

// 基本操作
const inputKey = ref('test-key');
const inputValue = ref('test-value');
const result = ref('');

// 响应式存储
const [reactiveValue, setReactiveValue, clearReactiveValue] = useLocalStorage(
  'reactive-test',
  '初始值'
);

// 过期时间存储
const expireValue = ref('');
const expireTime = ref(5);
const expireResult = ref('');

// 统计信息
const stats = ref<StorageStats | null>(null);

// 基本操作方法
const setValue = () => {
  const success = storage.set(inputKey.value, inputValue.value);
  result.value = success ? '设置成功' : '设置失败';
};

const getValue = () => {
  const value = storage.get(inputKey.value);
  result.value = value !== null ? `获取到: ${value}` : '未找到或已过期';
};

const removeValue = () => {
  const success = storage.remove(inputKey.value);
  result.value = success ? '删除成功' : '删除失败';
};

// 过期时间操作
const setExpireValue = () => {
  const success = storage.set('expire-test', expireValue.value, {
    expires: expireTime.value * 1000
  });
  expireResult.value = success ? '设置成功，等待过期...' : '设置失败';
};

const getExpireValue = () => {
  const value = storage.get('expire-test');
  expireResult.value = value !== null ? `获取到: ${value}` : '未找到或已过期';
};

// 统计信息
const getStats = () => {
  stats.value = storage.getStats();
};

const clearExpired = () => {
  const count = storage.clearExpired();
  result.value = `清理了 ${count} 个过期项`;
};

onMounted(() => {
  getStats();
});
</script>

<style scoped>
.example-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group input,
.form-group button {
  margin-right: 10px;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.form-group button {
  background-color: #007bff;
  color: white;
  cursor: pointer;
  border: none;
}

.form-group button:hover {
  background-color: #0056b3;
}

.result {
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
  margin-top: 10px;
}

pre {
  margin: 0;
  white-space: pre-wrap;
}

h2, h3 {
  color: #333;
}
</style>

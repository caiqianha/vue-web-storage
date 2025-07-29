<template>
  <div class="advanced-example">
    <h2>Vue Web Storage 高级使用示例</h2>

    <!-- 用户设置管理 -->
    <div class="section">
      <h3>用户设置管理</h3>
      <div class="settings-form">
        <label>
          <input type="checkbox" v-model="userSettings.darkMode" />
          深色模式
        </label>
        <label>
          <input type="checkbox" v-model="userSettings.notifications" />
          通知
        </label>
        <label>
          语言:
          <select v-model="userSettings.language">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label>
          主题色:
          <input type="color" v-model="userSettings.primaryColor" />
        </label>
      </div>
      <div class="result">
        当前设置: {{ JSON.stringify(userSettings, null, 2) }}
      </div>
    </div>

    <!-- 购物车管理 -->
    <div class="section">
      <h3>购物车管理</h3>
      <div class="cart-form">
        <input v-model="newProduct.name" placeholder="商品名称" />
        <input v-model.number="newProduct.price" placeholder="价格" type="number" />
        <input v-model.number="newProduct.quantity" placeholder="数量" type="number" />
        <button @click="addToCart">添加到购物车</button>
        <button @click="clearCart">清空购物车</button>
      </div>
      <div class="cart-items">
        <h4>购物车 ({{ cartItems.length }} 件商品)</h4>
        <div v-for="(item, index) in cartItems" :key="index" class="cart-item">
          <span>{{ item.name }} - ¥{{ item.price }} x {{ item.quantity }}</span>
          <button @click="removeFromCart(index)">删除</button>
        </div>
        <div class="cart-total">总计: ¥{{ cartTotal }}</div>
      </div>
    </div>

    <!-- 表单数据自动保存 -->
    <div class="section">
      <h3>表单数据自动保存</h3>
      <form class="auto-save-form">
        <div class="form-row">
          <label>姓名:</label>
          <input v-model="formData.name" placeholder="请输入姓名" />
        </div>
        <div class="form-row">
          <label>邮箱:</label>
          <input v-model="formData.email" type="email" placeholder="请输入邮箱" />
        </div>
        <div class="form-row">
          <label>电话:</label>
          <input v-model="formData.phone" placeholder="请输入电话" />
        </div>
        <div class="form-row">
          <label>地址:</label>
          <textarea v-model="formData.address" placeholder="请输入地址"></textarea>
        </div>
        <div class="form-row">
          <label>备注:</label>
          <textarea v-model="formData.notes" placeholder="请输入备注"></textarea>
        </div>
        <button type="button" @click="clearForm">清空表单</button>
        <button type="button" @click="restoreForm">恢复保存的数据</button>
      </form>
      <div class="save-status">{{ saveStatus }}</div>
    </div>

    <!-- 临时数据 (sessionStorage) -->
    <div class="section">
      <h3>临时数据 (Session Storage)</h3>
      <div class="temp-data-form">
        <input v-model="tempData" placeholder="临时数据" />
        <button @click="saveTempData">保存临时数据</button>
        <button @click="getTempData">获取临时数据</button>
        <button @click="clearTempData">清除临时数据</button>
      </div>
      <div class="result">临时数据: {{ tempDataResult }}</div>
    </div>

    <!-- 事件监听 -->
    <div class="section">
      <h3>存储事件监听</h3>
      <div class="events-log">
        <h4>事件日志:</h4>
        <div v-for="(event, index) in eventLog" :key="index" class="event-item">
          <span class="event-type">{{ event.type }}</span>
          <span class="event-key">{{ event.key }}</span>
          <span class="event-time">{{ formatTime(event.timestamp) }}</span>
        </div>
      </div>
      <button @click="clearEventLog">清空日志</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  useLocalStorage,
  useSessionStorage,
  WebStorage,
  StorageEventData,
  StorageEventListener
} from '../src';

// 用户设置
interface UserSettings {
  darkMode: boolean;
  notifications: boolean;
  language: string;
  primaryColor: string;
}

const [userSettings] = useLocalStorage<UserSettings>('user-settings', {
  darkMode: false,
  notifications: true,
  language: 'zh',
  primaryColor: '#007bff'
});

// 购物车
interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

const [cartItems, setCartItems] = useLocalStorage<CartItem[]>('shopping-cart', []);

const newProduct = ref<CartItem>({
  name: '',
  price: 0,
  quantity: 1
});

const cartTotal = computed(() => {
  return cartItems.value.reduce((total, item) => total + item.price * item.quantity, 0);
});

const addToCart = () => {
  if (newProduct.value.name && newProduct.value.price > 0) {
    cartItems.value.push({ ...newProduct.value });
    newProduct.value = { name: '', price: 0, quantity: 1 };
  }
};

const removeFromCart = (index: number) => {
  cartItems.value.splice(index, 1);
};

const clearCart = () => {
  cartItems.value = [];
};

// 表单自动保存
interface FormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

const [formData, setFormData, clearFormData] = useLocalStorage<FormData>('auto-save-form', {
  name: '',
  email: '',
  phone: '',
  address: '',
  notes: ''
});

const saveStatus = ref('');

// 监听表单数据变化，自动保存
watch(
  formData,
  () => {
    saveStatus.value = '已自动保存 ' + new Date().toLocaleTimeString();
  },
  { deep: true }
);

const clearForm = () => {
  clearFormData();
  saveStatus.value = '表单已清空';
};

const restoreForm = () => {
  // 强制重新从存储加载数据
  const storage = new WebStorage({ prefix: 'vue-local-' });
  const savedData = storage.get<FormData>('auto-save-form');
  if (savedData) {
    formData.value = savedData;
    saveStatus.value = '数据已恢复';
  }
};

// 临时数据 (sessionStorage)
const [sessionData, setSessionData, clearSessionData] = useSessionStorage<string>('temp-data', '');
const tempData = ref('');
const tempDataResult = ref('');

const saveTempData = () => {
  setSessionData(tempData.value);
  tempDataResult.value = '已保存到 SessionStorage';
};

const getTempData = () => {
  tempDataResult.value = sessionData.value || '无数据';
};

const clearTempData = () => {
  clearSessionData();
  tempDataResult.value = '已清除';
};

// 事件监听
const eventLog = ref<StorageEventData[]>([]);
const storage = new WebStorage({ prefix: 'vue-local-' });

const eventListener: StorageEventListener = (data) => {
  eventLog.value.unshift(data);
  // 只保留最近50条事件
  if (eventLog.value.length > 50) {
    eventLog.value = eventLog.value.slice(0, 50);
  }
};

const clearEventLog = () => {
  eventLog.value = [];
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString();
};

onMounted(() => {
  // 监听存储事件
  storage.on('set', eventListener);
  storage.on('get', eventListener);
  storage.on('remove', eventListener);
  storage.on('clear', eventListener);
  storage.on('expired', eventListener);
});

onUnmounted(() => {
  // 清理事件监听器
  storage.off('set', eventListener);
  storage.off('get', eventListener);
  storage.off('remove', eventListener);
  storage.off('clear', eventListener);
  storage.off('expired', eventListener);
});
</script>

<style scoped>
.advanced-example {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #fafafa;
}

.settings-form label {
  display: block;
  margin-bottom: 10px;
}

.settings-form input,
.settings-form select {
  margin-left: 10px;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.cart-form {
  margin-bottom: 15px;
}

.cart-form input,
.cart-form button {
  margin-right: 10px;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.cart-form button {
  background-color: #28a745;
  color: white;
  border: none;
  cursor: pointer;
}

.cart-form button:hover {
  background-color: #218838;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  background-color: white;
  border-radius: 4px;
}

.cart-item button {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.cart-total {
  font-weight: bold;
  font-size: 18px;
  margin-top: 10px;
  text-align: right;
}

.auto-save-form .form-row {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.auto-save-form label {
  width: 80px;
  margin-right: 10px;
}

.auto-save-form input,
.auto-save-form textarea {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.auto-save-form textarea {
  height: 60px;
  resize: vertical;
}

.auto-save-form button {
  margin-right: 10px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.auto-save-form button:first-of-type {
  background-color: #6c757d;
  color: white;
}

.auto-save-form button:last-of-type {
  background-color: #17a2b8;
  color: white;
}

.save-status {
  margin-top: 10px;
  color: #28a745;
  font-style: italic;
}

.temp-data-form input,
.temp-data-form button {
  margin-right: 10px;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.temp-data-form button {
  background-color: #007bff;
  color: white;
  border: none;
  cursor: pointer;
}

.events-log {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: white;
  padding: 10px;
}

.event-item {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid #eee;
}

.event-type {
  font-weight: bold;
  color: #007bff;
}

.event-key {
  color: #6c757d;
}

.event-time {
  color: #999;
  font-size: 12px;
}

.result {
  margin-top: 15px;
  padding: 10px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #ddd;
  white-space: pre-wrap;
}

h2, h3, h4 {
  color: #333;
}
</style>

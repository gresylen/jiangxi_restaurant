new Vue({
    el: '#app',
    data: {
        dishes: [],
        orders: [],
        currentTable: 1,
        currentOrderItems: [],
        checkoutTable: 1,
        actualPayment: '',
        invoiceInfo: '',
        currentManageTab: '价格管理',
        newDishName: '',
        newDishPrice: '',
        newDishCategory: '荤菜',
        currentPage: 'order',
        lastRefreshTime: '',
        todayOrders: 0,
        todayRevenue: 0,
        hotDish: '-',
        hotDishes: [],
        last7Days: [],
        chartPoints: [],
        linePath: '',
        showManualModal: false,
        manualDishName: '',
        manualDishPrice: '',
        manualDishRemark: '',
        manualDishQuantity: 1,
        selectedImageFile: null
    },
    computed: {
        pendingOrders() {
            return this.orders.filter(order => order.status === '未结账');
        },
        completedOrders() {
            return this.orders.filter(order => order.status === '未结账');
        },
        currentCheckoutOrder() {
            return this.orders.find(order => order.table_id === this.checkoutTable && order.status === '未结账');
        },
        pendingCount() {
            let count = 0;
            this.pendingOrders.forEach(order => {
                order.items.forEach(item => { if (item.status === '待做') count++; });
            });
            return count;
        },
        completedCount() {
            let count = 0;
            this.completedOrders.forEach(order => {
                order.items.forEach(item => { if (item.status === '已完成') count++; });
            });
            return count;
        }
    },
    mounted() {
        this.loadDishes();
        this.loadOrders();
        this.updateRefreshTime();
        this.generateChartData();
        setInterval(() => {
            this.loadOrders();
            this.updateRefreshTime();
        }, 3000);
    },
    methods: {
        loadDishes() {
            fetch('/api/dishes')
                .then(res => res.json())
                .then(data => { this.dishes = data.dishes; });
        },
        loadOrders() {
            fetch('/api/orders')
                .then(res => res.json())
                .then(data => {
                    this.orders = data.orders;
                    this.updateStatistics();
                    // 注意：不在这里刷新 currentOrderItems，避免未提交的菜被覆盖
                });
        },
        refreshCurrentOrderItems() {
            const currentOrder = this.orders.find(o => o.table_id === this.currentTable && o.status === '未结账');
            this.currentOrderItems = currentOrder ? [...currentOrder.items] : [];
        },
        updateRefreshTime() {
            const now = new Date();
            this.lastRefreshTime = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        },
        generateChartData() {
            const today = new Date();
            this.last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                this.last7Days.push(`${date.getMonth() + 1}/${date.getDate()}`);
            }
            const mockData = [1200, 1600, 800, 1800, 2000, 1700, 2400];
            this.chartPoints = mockData.map((value, index) => ({
                x: (index * 300) / 6 + 20,
                y: 140 - (value / 2400) * 120
            }));
            this.linePath = this.chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        },
        updateStatistics() {
            const today = new Date().toISOString().split('T')[0];
            const todayOrdersList = this.orders.filter(o => o.create_time.includes(today) && o.status === '已结账');
            this.todayOrders = todayOrdersList.length;
            this.todayRevenue = todayOrdersList.reduce((sum, o) => sum + o.actual_payment, 0);
            const dishCount = {};
            todayOrdersList.forEach(order => {
                order.items.forEach(item => { dishCount[item.dish_name] = (dishCount[item.dish_name] || 0) + item.quantity; });
            });
            const sortedDishes = Object.entries(dishCount).sort((a, b) => b[1] - a[1]);
            this.hotDish = sortedDishes.length > 0 ? sortedDishes[0][0] : '-';
            this.hotDishes = sortedDishes.slice(0, 6).map(([name, quantity]) => ({
                dish_name: name,
                quantity: quantity,
                percent: Math.max((quantity / (sortedDishes[0]?.[1] || 1)) * 100, 10)
            }));
        },
        switchPage(page) {
            this.currentPage = page;
        },
        selectTable(table) {
            this.currentTable = table;
            this.currentOrderItems = [];
            this.refreshCurrentOrderItems();
        },
        addToOrder(dish) {
            const existingItem = this.currentOrderItems.find(item => item.dish_id === dish.dish_id);
            if (existingItem) {
                existingItem.quantity++;
            } else {
                this.currentOrderItems.push({
                    item_id: Date.now(),
                    dish_id: dish.dish_id,
                    dish_name: dish.dish_name,
                    price: dish.price,
                    quantity: 1,
                    remark: '',
                    status: '待做',
                    image_path: dish.image_path
                });
            }
        },
        openManualAdd() {
            this.showManualModal = true;
            this.manualDishName = '';
            this.manualDishPrice = '';
            this.manualDishRemark = '';
            this.manualDishQuantity = 1;
        },
        addManualDish() {
            if (!this.manualDishName || !this.manualDishPrice) {
                alert('请填写菜品名称和价格');
                return;
            }
            this.currentOrderItems.push({
                item_id: Date.now(),
                dish_id: null,
                dish_name: this.manualDishName,
                price: parseFloat(this.manualDishPrice),
                quantity: parseInt(this.manualDishQuantity) || 1,
                remark: this.manualDishRemark,
                status: '待做',
                image_path: ''   // 空字符串，后端会补成默认图片
            });
            this.showManualModal = false;
        },
        removeFromOrder(index) {
            if (confirm('确定删除该菜品？')) this.currentOrderItems.splice(index, 1);
        },
        increaseQty(index) { this.currentOrderItems[index].quantity++; },
        decreaseQty(index) { if (this.currentOrderItems[index].quantity > 1) this.currentOrderItems[index].quantity--; },
        getTotalAmount() {
            return this.currentOrderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        },
        submitOrder() {
            if (this.currentOrderItems.length === 0) {
                alert('请先添加菜品');
                return;
            }
            fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_id: this.currentTable, items: this.currentOrderItems })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert('提交失败: ' + data.error);
                } else {
                    alert('订单提交成功');
                    this.currentOrderItems = [];
                    this.loadOrders();
                    this.refreshCurrentOrderItems();
                }
            })
            .catch(err => {
                console.error(err);
                alert('网络错误，请查看控制台');
            });
        },
        markComplete(orderId, itemId) {
            fetch(`/api/orders/${orderId}/items/${itemId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: '已完成' })
            }).then(() => this.loadOrders());
        },
        markPending(orderId, itemId) {
            fetch(`/api/orders/${orderId}/items/${itemId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: '待做' })
            }).then(() => this.loadOrders());
        },
        selectCheckoutTable(table) {
            this.checkoutTable = table;
            this.actualPayment = '';
            this.invoiceInfo = '';
        },
        checkout() {
            if (!this.currentCheckoutOrder) {
                alert('该桌没有未结账订单');
                return;
            }
            if (!this.actualPayment) {
                alert('请输入实付金额');
                return;
            }
            fetch(`/api/orders/${this.currentCheckoutOrder.order_id}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actual_payment: parseFloat(this.actualPayment), invoice_info: this.invoiceInfo })
            }).then(() => {
                alert('结账成功');
                this.loadOrders();
                this.actualPayment = '';
                this.invoiceInfo = '';
                if (this.checkoutTable === this.currentTable) {
                    this.currentOrderItems = [];
                }
            });
        },
        exportOrders() { window.open('/api/export'); },
        updatePrice(dish) {
            fetch(`/api/dishes/${dish.dish_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price: parseFloat(dish.price) })
            }).then(() => alert('价格更新成功'));
        },
        onImageSelected(event) {
            this.selectedImageFile = event.target.files[0];
        },
        addDishWithImage() {
            if (!this.newDishName || !this.newDishPrice) {
                alert('请输入菜品名称和价格');
                return;
            }
            const formData = new FormData();
            formData.append('dish_name', this.newDishName);
            formData.append('price', this.newDishPrice);
            formData.append('category', this.newDishCategory);
            if (this.selectedImageFile) formData.append('image', this.selectedImageFile);
            fetch('/api/dishes', { method: 'POST', body: formData })
                .then(() => {
                    alert('菜品添加成功');
                    this.newDishName = '';
                    this.newDishPrice = '';
                    this.selectedImageFile = null;
                    this.loadDishes();
                })
                .catch(err => alert('添加失败: ' + err));
        },
        backupData() { alert('备份功能开发中...'); }
    }
});
public class ArrayStack<T> {
    private Object[] items = new Object[8];
    private int size;

    public void push(T item) {
        if (size == items.length) items = java.util.Arrays.copyOf(items, size * 2);
        items[size++] = item;
    }

    @SuppressWarnings("unchecked")
    public T pop() {
        if (size == 0) throw new IllegalStateException("empty");
        T item = (T) items[--size];
        items[size] = null;
        return item;
    }
}
